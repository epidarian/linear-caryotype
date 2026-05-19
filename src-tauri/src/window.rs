//! Window helpers. Centralises the three named window states (sliver /
//! compact / expanded) plus opacity and edge-snap math.

use serde::{Deserialize, Serialize};
use tauri::{LogicalPosition, LogicalSize, Manager, WebviewWindow};

#[derive(Debug, Serialize, Deserialize, Clone, Copy, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum WindowState {
    Sliver,
    Compact,
    Expanded,
}

impl WindowState {
    fn size(self) -> (f64, f64) {
        match self {
            WindowState::Sliver => (360.0, 22.0),
            WindowState::Compact => (360.0, 140.0),
            WindowState::Expanded => (420.0, 320.0),
        }
    }
}

#[tauri::command]
pub async fn set_window_state(window: WebviewWindow, state: WindowState) -> Result<(), String> {
    let (w, h) = state.size();
    window
        .set_size(LogicalSize::new(w, h))
        .map_err(|e| e.to_string())?;
    window
        .set_resizable(matches!(state, WindowState::Expanded))
        .map_err(|e| e.to_string())?;
    // Always-on-top is sticky; reaffirm in case macOS dropped it after a
    // workspace change.
    window
        .set_always_on_top(true)
        .map_err(|e| e.to_string())?;
    Ok(())
}

/// Window opacity 0..1. We set the underlying webview alpha rather than the
/// CSS so background blur (NSVisualEffectView) still composites cleanly.
#[tauri::command]
pub async fn set_opacity(window: WebviewWindow, opacity: f64) -> Result<(), String> {
    let _ = window;
    // Tauri does not expose a portable per-window alpha API; on macOS we
    // use a CSS `:root { --opacity }` driven backdrop in the frontend.
    // This command is reserved for a future native call.
    let _ = opacity;
    Ok(())
}

#[derive(Debug, Deserialize)]
pub struct SnapPayload {
    pub threshold_px: f64,
}

/// Snap the window to the nearest screen edge if within `threshold_px`.
/// Returns the new position the window was moved to (or current position).
#[tauri::command]
pub async fn edge_snap(window: WebviewWindow, payload: SnapPayload) -> Result<(f64, f64), String> {
    let monitor = window
        .current_monitor()
        .map_err(|e| e.to_string())?
        .ok_or_else(|| "no monitor".to_string())?;
    let scale = monitor.scale_factor();
    let m_pos = monitor.position();
    let m_size = monitor.size();

    let pos = window
        .outer_position()
        .map_err(|e| e.to_string())?
        .to_logical::<f64>(scale);
    let size = window
        .outer_size()
        .map_err(|e| e.to_string())?
        .to_logical::<f64>(scale);

    let monitor_logical_pos = m_pos.to_logical::<f64>(scale);
    let monitor_logical_size = m_size.to_logical::<f64>(scale);

    let left_edge = monitor_logical_pos.x;
    let right_edge = monitor_logical_pos.x + monitor_logical_size.width;
    let top_edge = monitor_logical_pos.y;
    let bottom_edge = monitor_logical_pos.y + monitor_logical_size.height;

    let mut nx = pos.x;
    let mut ny = pos.y;
    if (pos.x - left_edge).abs() <= payload.threshold_px {
        nx = left_edge;
    } else if (right_edge - (pos.x + size.width)).abs() <= payload.threshold_px {
        nx = right_edge - size.width;
    }
    if (pos.y - top_edge).abs() <= payload.threshold_px {
        ny = top_edge;
    } else if (bottom_edge - (pos.y + size.height)).abs() <= payload.threshold_px {
        ny = bottom_edge - size.height;
    }

    if nx != pos.x || ny != pos.y {
        window
            .set_position(LogicalPosition::new(nx, ny))
            .map_err(|e| e.to_string())?;
    }
    Ok((nx, ny))
}

/// Programmatic drag-start hook so the sliver state (which has no native
/// titlebar) can be dragged from anywhere on its surface.
#[tauri::command]
pub async fn start_dragging(window: WebviewWindow) -> Result<(), String> {
    window.start_dragging().map_err(|e| e.to_string())
}

/// macOS-specific window chrome: floating level so we sit above normal
/// windows, transparent titlebar, and visible across spaces. Other
/// platforms get a no-op.
#[cfg(target_os = "macos")]
pub fn apply_macos_chrome(window: &WebviewWindow) {
    use cocoa::appkit::{NSWindow, NSWindowCollectionBehavior};
    use cocoa::base::id;
    use cocoa::foundation::NSInteger;
    // 3 = NSFloatingWindowLevel: above normal windows, below the menu bar.
    const FLOATING_LEVEL: NSInteger = 3;
    if let Ok(ns_window) = window.ns_window() {
        unsafe {
            let ns_window = ns_window as id;
            ns_window.setLevel_(FLOATING_LEVEL);
            let behavior = NSWindowCollectionBehavior::NSWindowCollectionBehaviorCanJoinAllSpaces
                | NSWindowCollectionBehavior::NSWindowCollectionBehaviorFullScreenAuxiliary
                | NSWindowCollectionBehavior::NSWindowCollectionBehaviorStationary;
            ns_window.setCollectionBehavior_(behavior);
        }
    }
}

#[cfg(not(target_os = "macos"))]
pub fn apply_macos_chrome(_window: &WebviewWindow) {}

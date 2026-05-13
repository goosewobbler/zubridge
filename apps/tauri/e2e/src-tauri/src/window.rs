//! Mirrors `apps/electron/e2e/src/main/window.ts` - runtime-window creation
//! and window-classification helpers, adapted to Tauri's webview API.

use serde::Serialize;
use tauri::{AppHandle, Manager, Runtime, WebviewUrl, WebviewWindowBuilder};

const RUNTIME_LABEL_PREFIX: &str = "runtime_";

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum WindowType {
    Main,
    Secondary,
    Runtime,
}

impl WindowType {
    pub fn from_label(label: &str) -> Self {
        if label == "main" {
            Self::Main
        } else if label.starts_with(RUNTIME_LABEL_PREFIX) {
            Self::Runtime
        } else {
            Self::Secondary
        }
    }
}

#[derive(Debug, Clone, Serialize)]
pub struct WindowInfo {
    pub id: String,
    #[serde(rename = "type")]
    pub window_type: WindowType,
    pub subscriptions: Vec<String>,
}

/// Create the two test windows ('main' and 'secondary') at runtime.
/// Mirrors `wdio-desktop-mobile-example/packages/tauri/src-tauri/src/main.rs`
/// which creates its windows in the setup callback rather than pre-declaring
/// them in `tauri.conf.json` — pre-declared windows in tauri.conf.json are
/// created before plugins finish initialising, which prevents the wdio
/// frontend plugin from intercepting `window.__TAURI__.core.invoke` in time.
pub fn create_initial_windows<R: Runtime>(app: &AppHandle<R>) -> Result<(), String> {
    if app.get_webview_window("main").is_none() {
        WebviewWindowBuilder::new(app, "main", WebviewUrl::App("index.html".into()))
            .title("Zubridge E2E Tauri (Main)")
            .inner_size(800.0, 600.0)
            .build()
            .map_err(|e| format!("Failed to create main window: {}", e))?;
    }
    if app.get_webview_window("secondary").is_none() {
        WebviewWindowBuilder::new(app, "secondary", WebviewUrl::App("index.html".into()))
            .title("Zubridge E2E Tauri (Secondary)")
            .inner_size(700.0, 500.0)
            .position(100.0, 100.0)
            .build()
            .map_err(|e| format!("Failed to create secondary window: {}", e))?;
    }
    Ok(())
}

/// Create a fresh runtime window. Mirrors `createRuntimeWindow` in
/// `apps/electron/e2e/src/main/window.ts` and the inline `WebviewWindow`
/// builder calls the renderer used to do for itself.
pub fn create_runtime_window<R: Runtime>(
    app: &AppHandle<R>,
) -> Result<tauri::WebviewWindow<R>, String> {
    let label = format!(
        "{}{}",
        RUNTIME_LABEL_PREFIX,
        std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map(|d| d.as_millis())
            .unwrap_or(0)
    );
    println!("[Window] Creating runtime window: {}", label);

    let url = WebviewUrl::App("index.html".into());
    let title = format!("Zubridge Tauri Example - Runtime ({})", label);
    WebviewWindowBuilder::new(app, label.clone(), url)
        .title(title)
        .inner_size(600.0, 485.0)
        .build()
        .map_err(|e| format!("Failed to create runtime window {}: {}", label, e))
}

/// Look up the current label's classification.
pub fn window_info_for<R: Runtime>(app: &AppHandle<R>, label: &str) -> WindowInfo {
    let subscriptions = match app.try_state::<tauri_plugin_zubridge::Zubridge<R>>() {
        Some(zubridge) => zubridge
            .inner()
            .get_window_subscriptions(label)
            .unwrap_or_default(),
        None => Vec::new(),
    };
    WindowInfo {
        id: label.to_string(),
        window_type: WindowType::from_label(label),
        subscriptions,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn classifies_labels() {
        assert_eq!(WindowType::from_label("main"), WindowType::Main);
        assert_eq!(
            WindowType::from_label("runtime_42"),
            WindowType::Runtime
        );
        assert_eq!(
            WindowType::from_label("secondary"),
            WindowType::Secondary
        );
    }
}

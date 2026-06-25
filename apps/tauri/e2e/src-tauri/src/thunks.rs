//! Backend (Rust) thunks paralleling Electron's main-process thunk
//! (`apps/electron/e2e/src/main/index.ts` EXECUTE_MAIN_THUNK / _SLOW).
//!
//! A backend thunk reads the counter, then dispatches a DOUBLE -> DOUBLE ->
//! HALVE sequence with delays *between* dispatches (net N -> 2N), coordinated
//! via the core thunk-lifecycle API. Because the plugin routes dispatch through
//! the action scheduler, registering the thunk blocks concurrent non-thunk
//! actions (e.g. increments from a webview) until the thunk completes — the
//! same coordination Electron's main thunks get.
//!
//! "Main process thunks" in Electron are JS thunks dispatched from the Node
//! main process. Tauri's backend is Rust with no JS runtime, so the equivalent
//! is authored in Rust here; the *symmetry* (same code front and back) does not
//! carry over, but the backend-originated, cross-window-propagating behaviour
//! does.

use std::time::Duration;

use serde::Serialize;
use serde_json::Value;
use tauri::{AppHandle, Runtime};
use tauri_plugin_zubridge::{ZubridgeAction, ZubridgeExt};
use uuid::Uuid;

/// Synthetic source label that owns backend thunks. Distinct from any real
/// webview label (`main`, `secondary`, `runtime_*`) so window-close cleanup
/// (`forget_label`) never drops it mid-flight.
const BACKEND_LABEL: &str = "__backend";

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MainThunkResult {
    pub success: bool,
    pub result: i32,
}

/// Build a backend-sourced action tagged with the in-flight thunk id, so the
/// scheduler treats it as belonging to the active root thunk (executes
/// immediately) and the broadcast attributes the update to the thunk.
fn backend_action(action_type: &str, thunk_id: &str) -> ZubridgeAction {
    ZubridgeAction {
        id: None,
        action_type: action_type.to_string(),
        payload: None,
        source_label: Some(BACKEND_LABEL.to_string()),
        thunk_parent_id: Some(thunk_id.to_string()),
        immediate: None,
        keys: None,
        bypass_access_control: None,
        starts_thunk: None,
        ends_thunk: None,
    }
}

/// Read the current counter from plugin state (0 if absent, matching Electron's
/// `currentState.counter || 0`).
fn read_counter<R: Runtime>(app: &AppHandle<R>) -> Result<i32, String> {
    let state = app
        .zubridge()
        .get_initial_state()
        .map_err(|e| e.to_string())?;
    Ok(state.get("counter").and_then(Value::as_i64).unwrap_or(0) as i32)
}

/// Register a thunk, run the DOUBLE/DOUBLE/HALVE sequence, then complete it.
/// `slow` selects the `:SLOW` action types and the longer inter-step delay.
async fn run_double_thunk<R: Runtime>(
    app: AppHandle<R>,
    slow: bool,
) -> Result<MainThunkResult, String> {
    let (double, halve, delay) = if slow {
        (
            "COUNTER:DOUBLE:SLOW",
            "COUNTER:HALVE:SLOW",
            Duration::from_millis(1000),
        )
    } else {
        ("COUNTER:DOUBLE", "COUNTER:HALVE", Duration::from_millis(100))
    };

    // Unique id per invocation so concurrent triggers never collide on register.
    let thunk_id = Uuid::new_v4().to_string();
    app.zubridge()
        .register_thunk(
            thunk_id.clone(),
            None,
            BACKEND_LABEL.to_string(),
            None,
            false,
            false,
        )
        .map_err(|e| e.to_string())?;

    // Run the sequence; complete the thunk on *every* exit path, otherwise the
    // registry leaks the record and the scheduler stays blocked forever.
    let outcome = drive_sequence(&app, &thunk_id, double, halve, delay).await;
    let error = outcome.as_ref().err().cloned();
    if let Err(e) = app
        .zubridge()
        .complete_thunk(&thunk_id, BACKEND_LABEL, error)
    {
        eprintln!("[BackendThunk] complete_thunk({thunk_id}) failed: {e}");
    }

    outcome.map(|result| MainThunkResult {
        success: true,
        result,
    })
}

/// read -> DOUBLE -> sleep -> DOUBLE -> sleep -> HALVE -> sleep -> read.
/// Each dispatch is a separate `dispatch_action` (which takes + releases the
/// plugin's broadcast lock internally); the `sleep` happens *between*
/// dispatches with no lock held.
async fn drive_sequence<R: Runtime>(
    app: &AppHandle<R>,
    thunk_id: &str,
    double: &str,
    halve: &str,
    delay: Duration,
) -> Result<i32, String> {
    let _start = read_counter(app)?; // parity with Electron's getState() at the top

    app.zubridge()
        .dispatch_action(backend_action(double, thunk_id))
        .map_err(|e| e.to_string())?;
    tokio::time::sleep(delay).await;

    app.zubridge()
        .dispatch_action(backend_action(double, thunk_id))
        .map_err(|e| e.to_string())?;
    tokio::time::sleep(delay).await;

    app.zubridge()
        .dispatch_action(backend_action(halve, thunk_id))
        .map_err(|e| e.to_string())?;
    tokio::time::sleep(delay).await;

    read_counter(app)
}

#[tauri::command]
pub async fn execute_main_thunk<R: Runtime>(app: AppHandle<R>) -> Result<MainThunkResult, String> {
    run_double_thunk(app, false).await
}

#[tauri::command]
pub async fn execute_main_thunk_slow<R: Runtime>(
    app: AppHandle<R>,
) -> Result<MainThunkResult, String> {
    run_double_thunk(app, true).await
}

#[cfg(test)]
mod tests {
    // Pure model of the DOUBLE/DOUBLE/HALVE net effect, mirroring
    // `features::counter::{double, halve}`. The async command path is covered
    // by the Tauri E2E suite (`test/specs/backend-thunk.spec.ts`).
    fn double(x: i32) -> i32 {
        x.saturating_mul(2)
    }
    fn halve(x: i32) -> i32 {
        ((x as f64) / 2.0).round() as i32
    }
    fn final_counter_from(start: i32) -> i32 {
        halve(double(double(start)))
    }

    #[test]
    fn net_effect_is_a_double() {
        assert_eq!(final_counter_from(5), 10);
        assert_eq!(final_counter_from(3), 6);
        assert_eq!(final_counter_from(0), 0);
        assert_eq!(final_counter_from(-4), -8);
    }
}

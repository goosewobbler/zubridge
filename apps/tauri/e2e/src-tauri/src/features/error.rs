use std::fmt;

/// Errors a state-manager can raise while applying an action. Returned as a
/// JSON `{ success: false, error: ".." }` envelope so the renderer's
/// `TauriCommandError` reporter has something useful to show.
#[derive(Debug, Clone)]
pub enum ActionError {
    /// Action `type` field was missing or wasn't a string.
    MissingType,
    /// Action `type` did not match anything this mode handles.
    UnknownAction(String),
    /// Payload had the wrong shape for the action (e.g. `COUNTER:SET` without a number).
    InvalidPayload {
        action_type: String,
        message: String,
    },
    /// Intentional panic-style error used by the error-testing UI.
    TriggeredMainProcessError,
}

impl fmt::Display for ActionError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::MissingType => write!(f, "Action is missing a string `type` field"),
            Self::UnknownAction(t) => write!(f, "Unknown action type: {}", t),
            Self::InvalidPayload {
                action_type,
                message,
            } => write!(f, "Invalid payload for {}: {}", action_type, message),
            Self::TriggeredMainProcessError => write!(
                f,
                "Intentional error thrown in main process for testing purposes"
            ),
        }
    }
}

impl std::error::Error for ActionError {}

/// The single action type the renderer fires when exercising error paths in
/// the e2e tests. Callers should bubble this up through the StateManager so
/// the renderer's `TauriCommandError` surface is exercised.
pub fn trigger_main_process_error() -> ActionError {
    ActionError::TriggeredMainProcessError
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn display_includes_action_type_for_invalid_payload() {
        let e = ActionError::InvalidPayload {
            action_type: "COUNTER:SET".into(),
            message: "expected number".into(),
        };
        let msg = format!("{}", e);
        assert!(msg.contains("COUNTER:SET"));
        assert!(msg.contains("expected number"));
    }

    #[test]
    fn trigger_returns_expected_variant() {
        assert!(matches!(
            trigger_main_process_error(),
            ActionError::TriggeredMainProcessError
        ));
    }
}

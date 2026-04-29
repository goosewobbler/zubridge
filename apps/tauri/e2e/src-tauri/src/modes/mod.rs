pub mod custom;
pub mod redux;
pub mod zustand_basic;
pub mod zustand_handlers;
pub mod zustand_reducers;

use std::str::FromStr;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ZubridgeMode {
    ZustandBasic,
    ZustandHandlers,
    ZustandReducers,
    Redux,
    Custom,
}

impl ZubridgeMode {
    pub fn label(self) -> &'static str {
        match self {
            Self::ZustandBasic => "zustand-basic",
            Self::ZustandHandlers => "zustand-handlers",
            Self::ZustandReducers => "zustand-reducers",
            Self::Redux => "redux",
            Self::Custom => "custom",
        }
    }
}

impl Default for ZubridgeMode {
    fn default() -> Self {
        Self::ZustandBasic
    }
}

impl FromStr for ZubridgeMode {
    type Err = ();

    fn from_str(s: &str) -> Result<Self, Self::Err> {
        match s.trim().to_lowercase().as_str() {
            "zustand-basic" | "basic" => Ok(Self::ZustandBasic),
            "zustand-handlers" | "handlers" => Ok(Self::ZustandHandlers),
            "zustand-reducers" | "reducers" => Ok(Self::ZustandReducers),
            "redux" => Ok(Self::Redux),
            "custom" => Ok(Self::Custom),
            _ => Err(()),
        }
    }
}

/// Resolves the active mode from the `ZUBRIDGE_MODE` environment variable,
/// falling back to `ZustandBasic` on missing or unrecognised values.
pub fn resolve_mode() -> ZubridgeMode {
    std::env::var("ZUBRIDGE_MODE")
        .ok()
        .and_then(|raw| ZubridgeMode::from_str(&raw).ok())
        .unwrap_or_default()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn defaults_to_basic_when_missing() {
        std::env::remove_var("ZUBRIDGE_MODE");
        assert_eq!(resolve_mode(), ZubridgeMode::ZustandBasic);
    }

    #[test]
    fn parses_known_aliases() {
        assert_eq!(
            ZubridgeMode::from_str("Zustand-Reducers").unwrap(),
            ZubridgeMode::ZustandReducers
        );
        assert_eq!(
            ZubridgeMode::from_str("redux").unwrap(),
            ZubridgeMode::Redux
        );
        assert_eq!(
            ZubridgeMode::from_str("custom").unwrap(),
            ZubridgeMode::Custom
        );
    }

    #[test]
    fn unknown_is_an_error() {
        assert!(ZubridgeMode::from_str("nonsense").is_err());
    }
}

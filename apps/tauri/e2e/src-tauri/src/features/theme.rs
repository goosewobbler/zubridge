use serde::{Deserialize, Serialize};

/// Theme enum mirroring the TypeScript `'light' | 'dark'` shape so the
/// renderer-side `getThemeSelector` and tests see identical wire values.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Theme {
    Light,
    Dark,
}

impl Theme {
    pub fn toggle(self) -> Self {
        match self {
            Self::Light => Self::Dark,
            Self::Dark => Self::Light,
        }
    }

    pub fn from_is_dark(is_dark: bool) -> Self {
        if is_dark {
            Self::Dark
        } else {
            Self::Light
        }
    }

    pub fn is_dark(self) -> bool {
        matches!(self, Self::Dark)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn toggle_flips_theme() {
        assert_eq!(Theme::Light.toggle(), Theme::Dark);
        assert_eq!(Theme::Dark.toggle(), Theme::Light);
    }

    #[test]
    fn from_is_dark_round_trips() {
        assert_eq!(Theme::from_is_dark(true), Theme::Dark);
        assert_eq!(Theme::from_is_dark(false), Theme::Light);
        assert!(Theme::Dark.is_dark());
        assert!(!Theme::Light.is_dark());
    }
}

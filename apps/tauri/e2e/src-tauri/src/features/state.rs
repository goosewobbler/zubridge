use serde::{Deserialize, Serialize};
use serde_json::{Map, Value};
use std::collections::BTreeMap;

use super::theme::Theme;

/// Shared base state used by every mode. Mirrors the TypeScript `BaseState`
/// from `@zubridge/apps-shared` so the renderer-side selectors line up.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct BaseState {
    pub counter: i32,
    pub theme: Theme,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub filler: Option<Value>,
}

impl Default for BaseState {
    fn default() -> Self {
        Self::initial()
    }
}

impl BaseState {
    pub fn initial() -> Self {
        Self {
            counter: 0,
            theme: Theme::Dark,
            filler: None,
        }
    }
}

#[derive(Debug, Clone, Copy)]
pub enum FillerVariant {
    Small,
    Medium,
    Large,
    Xl,
}

impl FillerVariant {
    pub fn from_payload(payload: Option<&Value>) -> Self {
        let variant = payload
            .and_then(|p| p.get("variant"))
            .and_then(Value::as_str)
            .unwrap_or("medium");
        match variant {
            "small" => Self::Small,
            "large" => Self::Large,
            "xl" => Self::Xl,
            _ => Self::Medium,
        }
    }

    fn entry_count(self) -> usize {
        match self {
            Self::Small => 32,
            Self::Medium => 256,
            Self::Large => 1024,
            Self::Xl => 4096,
        }
    }

    fn label(self) -> &'static str {
        match self {
            Self::Small => "small",
            Self::Medium => "medium",
            Self::Large => "large",
            Self::Xl => "xl",
        }
    }
}

/// Mirrors `generateTestState` from `@zubridge/apps-shared` - produces a
/// chunky payload to exercise delta-encoding in tests. We only need the
/// `meta.estimatedSize` field to be present for the renderer log strings;
/// the rest is filler integers.
pub fn generate_filler(variant: FillerVariant) -> Value {
    let entries = variant.entry_count();
    let mut map = Map::with_capacity(entries + 1);
    let mut sorted: BTreeMap<String, Value> = BTreeMap::new();
    for i in 0..entries {
        sorted.insert(format!("entry_{:05}", i), Value::from((i as i64) * 7));
    }
    for (k, v) in sorted {
        map.insert(k, v);
    }
    let estimated_bytes = entries * 16;
    let mut meta = Map::new();
    meta.insert("variant".to_string(), Value::from(variant.label()));
    meta.insert("entries".to_string(), Value::from(entries as i64));
    meta.insert(
        "estimatedSize".to_string(),
        Value::from(format!("~{}B", estimated_bytes)),
    );
    map.insert("meta".to_string(), Value::Object(meta));
    Value::Object(map)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn initial_state_has_dark_theme_and_zero_counter() {
        let state = BaseState::initial();
        assert_eq!(state.counter, 0);
        assert!(matches!(state.theme, Theme::Dark));
        assert!(state.filler.is_none());
    }

    #[test]
    fn filler_variants_grow_in_size() {
        let small = generate_filler(FillerVariant::Small);
        let xl = generate_filler(FillerVariant::Xl);
        let small_obj = small.as_object().unwrap();
        let xl_obj = xl.as_object().unwrap();
        assert!(xl_obj.len() > small_obj.len());
        assert!(small_obj.contains_key("meta"));
    }
}

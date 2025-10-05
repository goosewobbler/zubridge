// Core Store struct - platform-agnostic state management

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[cfg_attr(feature = "uniffi", derive(uniffi::Object))]
pub struct Store {
    pub name: String,
}

#[cfg_attr(feature = "uniffi", uniffi::export)]
impl Store {
    #[cfg_attr(feature = "uniffi", uniffi::constructor)]
    pub fn new(name: String) -> Self {
        Store { name }
    }

    pub fn get_name(&self) -> String {
        self.name.clone()
    }
}

// UniFFI helper function
#[cfg(feature = "uniffi")]
pub fn create_store(name: String) -> Store {
    Store::new(name)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_store_new_creates_store_with_correct_name() {
        let store = Store::new("test-store".to_string());
        assert_eq!(store.name, "test-store");
    }

    #[test]
    fn test_store_get_name_returns_expected_value() {
        let store = Store::new("my-store".to_string());
        let name = store.get_name();
        assert_eq!(name, "my-store");
    }

    #[test]
    fn test_store_new_with_empty_string() {
        let store = Store::new("".to_string());
        assert_eq!(store.name, "");
    }

    #[test]
    fn test_store_get_name_returns_clone() {
        let store = Store::new("test".to_string());
        let name1 = store.get_name();
        let name2 = store.get_name();
        // Both should be equal but independent strings
        assert_eq!(name1, name2);
    }
}

// Integration test to verify the uniffi feature compiles correctly
// This test ensures that when the uniffi feature is enabled,
// the crate compiles and the UniFFI bindings are generated properly.

#[cfg(feature = "uniffi")]
#[test]
fn test_uniffi_feature_compiles() {
    use zubridge_core::{create_store, Store};

    // Test that create_store function is available
    let store = create_store("uniffi-test".to_string());
    assert_eq!(store.get_name(), "uniffi-test");

    // Test that Store can be constructed directly
    let store2 = Store::new("uniffi-direct".to_string());
    assert_eq!(store2.get_name(), "uniffi-direct");
}

#[cfg(not(feature = "uniffi"))]
#[test]
fn test_uniffi_feature_not_enabled() {
    // When uniffi is not enabled, this test should pass
    assert!(true, "uniffi feature is not enabled");
}

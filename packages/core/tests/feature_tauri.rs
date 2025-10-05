// Integration test to verify the tauri feature compiles correctly
// This test ensures that when the tauri feature is enabled,
// the crate compiles and Tauri plugin structure is generated properly.

#[cfg(feature = "tauri")]
#[test]
fn test_tauri_feature_compiles() {
    use zubridge_core::wrappers::tauri::create_store;

    // Test that create_store function is available
    let store = create_store("tauri-test".to_string());
    assert_eq!(store.get_name(), "tauri-test");

    // Note: The init() function requires a Runtime type parameter,
    // so we can't easily test it without a full Tauri app context
}

#[cfg(not(feature = "tauri"))]
#[test]
fn test_tauri_feature_not_enabled() {
    // When tauri is not enabled, this test should pass
    assert!(true, "tauri feature is not enabled");
}

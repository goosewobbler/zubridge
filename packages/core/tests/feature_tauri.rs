// Integration test to verify the tauri feature compiles correctly
// This test ensures that when the tauri feature is enabled,
// the crate compiles and Tauri plugin structure is generated properly.

#[cfg(feature = "tauri")]
#[test]
fn test_tauri_feature_compiles() {
    // This test just needs to compile successfully when tauri feature is enabled
    // The actual functionality will be tested in unit tests
    assert!(true, "tauri feature compiles successfully");
}

#[cfg(not(feature = "tauri"))]
#[test]
fn test_tauri_feature_not_enabled() {
    // When tauri is not enabled, this test should pass
    assert!(true, "tauri feature is not enabled");
}

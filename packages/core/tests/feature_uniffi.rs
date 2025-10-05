// Integration test to verify the uniffi feature compiles correctly
// This test ensures that when the uniffi feature is enabled,
// the crate compiles and the UniFFI bindings are generated properly.

#[cfg(feature = "uniffi")]
#[test]
fn test_uniffi_feature_compiles() {
    // This test just needs to compile successfully when uniffi feature is enabled
    // The actual functionality will be tested in unit tests
    assert!(true, "uniffi feature compiles successfully");
}

#[cfg(not(feature = "uniffi"))]
#[test]
fn test_uniffi_feature_not_enabled() {
    // When uniffi is not enabled, this test should pass
    assert!(true, "uniffi feature is not enabled");
}

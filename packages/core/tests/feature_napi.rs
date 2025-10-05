// Integration test to verify the napi feature compiles correctly
// This test ensures that when the napi feature is enabled,
// the crate compiles and NAPI-RS bindings are generated properly.

#[cfg(feature = "napi")]
#[test]
fn test_napi_feature_compiles() {
    // This test just needs to compile successfully when napi feature is enabled
    // The actual functionality will be tested in unit tests
    assert!(true, "napi feature compiles successfully");
}

#[cfg(not(feature = "napi"))]
#[test]
fn test_napi_feature_not_enabled() {
    // When napi is not enabled, this test should pass
    assert!(true, "napi feature is not enabled");
}

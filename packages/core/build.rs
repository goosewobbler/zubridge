fn main() {
    #[cfg(feature = "uniffi")]
    uniffi::generate_scaffolding("./src/uniffi.udl").unwrap();

    #[cfg(feature = "napi")]
    napi_build::setup();
}

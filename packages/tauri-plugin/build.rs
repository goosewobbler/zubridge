const COMMANDS: &[&str] = &["get_initial_state", "dispatch_action"];

fn main() {
  // During cargo publish, ensure we use a proper directory that's included in the package
  // If this is a publish build, the environment variable CARGO_FEATURE_BEING_PACKAGED is set
  if std::env::var("CARGO_FEATURE_BEING_PACKAGED").is_ok() {
    // Set the generation directory to a standard location during packaging
    let out_dir = std::env::var("OUT_DIR").unwrap_or_else(|_| "target/package".to_string());
    std::env::set_var("TAURI_BUILD_GEN_DIR", out_dir);
  }

  tauri_build::try_build(
    tauri_build::Attributes::new()
      .plugin(
        "zubridge",
        tauri_build::InlinedPlugin::new().commands(&COMMANDS),
      )
  )
  .unwrap_or_else(|_| {
    println!("cargo:warning=Failed to build with tauri.conf.json, skipping config verification");
  });
}

const COMMANDS: &[&str] = &["get_initial_state", "dispatch_action"];

fn main() {
  // Set the working directory to OUT_DIR for the build process
  if let Ok(out_dir) = std::env::var("OUT_DIR") {
    // Set TAURI_BUILD_GEN_DIR to redirect schema generation to OUT_DIR
    std::env::set_var("TAURI_BUILD_GEN_DIR", &out_dir);
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

const COMMANDS: &[&str] = &["get_initial_state", "dispatch_action"];

fn main() {
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

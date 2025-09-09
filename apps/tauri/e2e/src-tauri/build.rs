fn main() {
  tauri_build::try_build(
    tauri_build::Attributes::new()
      .plugin(
        "zubridge",
        tauri_build::InlinedPlugin::new().commands(&["get_initial_state", "dispatch_action"]),
      )
  )
  .expect("failed to run tauri-build");
}

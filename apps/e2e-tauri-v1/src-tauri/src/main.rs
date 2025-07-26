// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

// // Removed module declaration for lib again
// mod lib;

fn main() {
  // Call run function via crate name
  app_lib::run();
}

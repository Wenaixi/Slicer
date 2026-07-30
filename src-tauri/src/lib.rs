#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  let builder = tauri::Builder::default();

  // Linux WebKitGTK ships without a secure context for the default tauri://
  // scheme, so window.crypto.subtle is undefined and the SealGo WASM stack
  // can't run. tauri-plugin-localhost re-hosts the assets on
  // http://localhost:<port>, which WebKitGTK treats as a secure origin and
  // unlocks SubtleCrypto. Port is picked at runtime to avoid collisions with
  // anything else the user is running. No-op on Windows/macOS — the native
  // scheme there is already secure, so we skip the plugin entirely.
  #[cfg(target_os = "linux")]
  let builder = {
    let port = portpicker::pick_unused_port()
      .expect("failed to pick a free port for tauri-plugin-localhost");
    builder.plugin(tauri_plugin_localhost::Builder::new(port).build())
  };

  builder
    .run(tauri::generate_context!())
    .expect("error while running tauri application");
}

// FinDocu als native App (Tauri 2): die React-Oberfläche läuft unverändert im WebView des Systems.
// Plugins:
//  - http:       Aufrufe der FinDocu-Server-Funktionen (/api/...) ohne Browser-CORS
//  - opener:     Anmeldung bei OneDrive / Google / Dropbox im System-Browser
//  - deep-link:  Rückkehr nach der Anmeldung über findocu://oauth?...
//  - dialog + fs: Exporte/Backups über „Sichern unter …“ speichern, PDFs im Standardprogramm öffnen
//  - updater + process (Desktop): neue Versionen von GitHub laden, installieren, neu starten
//  - single-instance (Desktop): Deep-Link landet im bereits offenen Fenster
#[cfg(desktop)]
mod disk;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let mut builder = tauri::Builder::default();

    #[cfg(desktop)]
    {
        builder = builder.plugin(tauri_plugin_single_instance::init(|app, _argv, _cwd| {
            use tauri::Manager;
            if let Some(w) = app.get_webview_window("main") {
                let _ = w.unminimize();
                let _ = w.set_focus();
            }
        }));
        // Selbst-Update (nur Mac/Windows/Linux): prüft GitHub-Releases, Pakete sind mit dem Update-Schlüssel signiert
        builder = builder
            .plugin(tauri_plugin_updater::Builder::new().build())
            .plugin(tauri_plugin_process::init())
            // Backups als Dateien + Speicherverbrauch (disk.rs)
            .invoke_handler(tauri::generate_handler![disk::bk_default_dir, disk::bk_write, disk::bk_list, disk::bk_read, disk::bk_delete, disk::bk_reveal, disk::disk_info]);
    }

    builder
        .plugin(tauri_plugin_deep_link::init())
        .plugin(tauri_plugin_http::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_notification::init())
        .setup(|app| {
            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }
            // Windows/Linux: Schema findocu:// beim Start registrieren (macOS/iOS über die Bundle-Konfiguration)
            #[cfg(any(windows, target_os = "linux"))]
            {
                use tauri_plugin_deep_link::DeepLinkExt;
                let _ = app.deep_link().register_all();
            }
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("FinDocu konnte nicht gestartet werden");
}

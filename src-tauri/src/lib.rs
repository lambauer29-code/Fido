// FinDocu als native App (Tauri 2): die React-Oberfläche läuft unverändert im WebView des Systems.
// Plugins:
//  - http:       Aufrufe der FinDocu-Server-Funktionen (/api/...) ohne Browser-CORS
//  - opener:     Anmeldung bei OneDrive / Google / Dropbox im System-Browser
//  - deep-link:  Rückkehr nach der Anmeldung über findocu://oauth?...
//  - dialog + fs: Exporte/Backups über „Sichern unter …“ speichern, PDFs im Standardprogramm öffnen
//  - updater + process (Desktop): neue Versionen von GitHub laden, installieren, neu starten
//  - single-instance (Desktop): Deep-Link landet im bereits offenen Fenster
// Drucken (Mac): PDF über PDFKit mit dem normalen macOS-Druckdialog drucken.
// window.print() im WebView zeigt beim Abbrechen fälschlich „Drucken nicht möglich“ –
// hier ist Abbrechen einfach Ok(false). Andere Systeme drucken weiter im WebView (platform.js).
#[cfg(target_os = "macos")]
mod mac_print {
    use objc2::{AllocAnyThread, MainThreadMarker};
    use objc2_app_kit::NSPrintInfo;
    use objc2_foundation::{NSString, NSURL};
    use objc2_pdf_kit::{PDFDocument, PDFPrintScalingMode};

    /// Ok(true) = gedruckt, Ok(false) = im Dialog abgebrochen. Muss im Hauptthread laufen.
    pub fn print(path: &str, title: &str) -> Result<bool, String> {
        let mtm = MainThreadMarker::new().ok_or("Drucken muss im Hauptthread laufen")?;
        let url = NSURL::fileURLWithPath(&NSString::from_str(path));
        let doc = unsafe { PDFDocument::initWithURL(PDFDocument::alloc(), &url) }
            .ok_or("PDF konnte nicht geöffnet werden")?;
        let info = NSPrintInfo::sharedPrintInfo();
        let op = unsafe {
            doc.printOperationForPrintInfo_scalingMode_autoRotate(
                Some(&info),
                PDFPrintScalingMode::PageScaleToFit,
                true,
                mtm,
            )
        }
        .ok_or("Druckauftrag konnte nicht erstellt werden")?;
        op.setJobTitle(Some(&NSString::from_str(title)));
        op.setShowsPrintPanel(true);
        op.setShowsProgressPanel(true);
        Ok(op.runOperation())
    }
}

#[cfg(target_os = "macos")]
#[tauri::command]
async fn print_pdf(app: tauri::AppHandle, path: String, title: String) -> Result<bool, String> {
    let (tx, rx) = std::sync::mpsc::channel();
    app.run_on_main_thread(move || {
        let _ = tx.send(mac_print::print(&path, &title));
    })
    .map_err(|e| e.to_string())?;
    tauri::async_runtime::spawn_blocking(move || rx.recv())
        .await
        .map_err(|e| e.to_string())?
        .map_err(|e| e.to_string())?
}

#[cfg(not(target_os = "macos"))]
#[tauri::command]
async fn print_pdf(path: String, title: String) -> Result<bool, String> {
    let _ = (path, title);
    Err("Nativer Druck gibt es nur in der Mac-App".into())
}

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
            .plugin(tauri_plugin_process::init());
    }

    builder
        .plugin(tauri_plugin_deep_link::init())
        .plugin(tauri_plugin_http::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_notification::init())
        .invoke_handler(tauri::generate_handler![print_pdf])
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

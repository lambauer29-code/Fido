// v0.99.94: Backups als Dateien auf der Festplatte + echter Speicherverbrauch (nur Mac/Windows-App)
use serde::Serialize;
use std::fs;
use std::path::{Path, PathBuf};
use tauri::Manager;

const PREFIX: &str = "findocu-auto-";

fn dir_size(p: &Path, depth: u32) -> u64 {
    let Ok(meta) = fs::symlink_metadata(p) else { return 0 };
    if meta.is_file() { return meta.len(); }
    if !meta.is_dir() || depth > 40 { return 0; }
    let Ok(rd) = fs::read_dir(p) else { return 0 };
    rd.flatten().map(|e| dir_size(&e.path(), depth + 1)).sum()
}
fn safe_name(name: &str) -> Result<(), String> {
    if name.starts_with(PREFIX) && name.ends_with(".json") && !name.contains('/') && !name.contains('\\') && !name.contains("..") { Ok(()) } else { Err("Ungültiger Dateiname".into()) }
}

#[derive(Serialize)]
pub struct BkFile { name: String, size: u64, mtime: u64 }

/// Standard-Ordner: Dokumente/FinDocu/Backups
#[tauri::command]
pub fn bk_default_dir(app: tauri::AppHandle) -> Result<String, String> {
    let d = app.path().document_dir().map_err(|e| e.to_string())?;
    Ok(d.join("FinDocu").join("Backups").to_string_lossy().into_owned())
}

/// Backup schreiben und alte aufräumen (behält die neuesten `keep`)
#[tauri::command]
pub fn bk_write(dir: String, name: String, data: String, keep: usize) -> Result<String, String> {
    safe_name(&name)?;
    let d = PathBuf::from(&dir);
    fs::create_dir_all(&d).map_err(|e| format!("Ordner nicht anlegbar: {e}"))?;
    let tmp = d.join(format!(".{name}.tmp"));
    fs::write(&tmp, data.as_bytes()).map_err(|e| format!("Schreiben fehlgeschlagen: {e}"))?;
    let target = d.join(&name);
    fs::rename(&tmp, &target).map_err(|e| e.to_string())?;
    let mut list = bk_list(dir)?;
    list.sort_by(|a, b| b.name.cmp(&a.name));
    for f in list.into_iter().skip(keep.max(1)) { let _ = fs::remove_file(d.join(f.name)); }
    Ok(target.to_string_lossy().into_owned())
}

#[tauri::command]
pub fn bk_list(dir: String) -> Result<Vec<BkFile>, String> {
    let Ok(rd) = fs::read_dir(&dir) else { return Ok(vec![]) };
    let mut out: Vec<BkFile> = rd.flatten().filter_map(|e| {
        let name = e.file_name().to_string_lossy().into_owned();
        if !(name.starts_with(PREFIX) && name.ends_with(".json")) { return None; }
        let m = e.metadata().ok()?;
        let mtime = m.modified().ok().and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok()).map(|d| d.as_millis() as u64).unwrap_or(0);
        Some(BkFile { name, size: m.len(), mtime })
    }).collect();
    out.sort_by(|a, b| b.name.cmp(&a.name));
    Ok(out)
}

#[tauri::command]
pub fn bk_read(dir: String, name: String) -> Result<String, String> {
    safe_name(&name)?;
    fs::read_to_string(Path::new(&dir).join(name)).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn bk_delete(dir: String, name: String) -> Result<(), String> {
    safe_name(&name)?;
    fs::remove_file(Path::new(&dir).join(name)).map_err(|e| e.to_string())
}

/// Ordner im Finder / Explorer zeigen
#[tauri::command]
pub fn bk_reveal(dir: String) -> Result<(), String> {
    let _ = fs::create_dir_all(&dir);
    #[cfg(target_os = "macos")] let prog = "open";
    #[cfg(windows)] let prog = "explorer";
    #[cfg(all(unix, not(target_os = "macos")))] let prog = "xdg-open";
    std::process::Command::new(prog).arg(&dir).spawn().map(|_| ()).map_err(|e| e.to_string())
}

#[derive(Serialize)]
pub struct DiskInfo { data: u64, backups: u64, free: u64, total: u64, data_dirs: Vec<String> }

/// Speicher: was FinDocu belegt (WebView-Daten, Caches), die Backups und freier Platz auf dem Laufwerk
#[tauri::command]
pub fn disk_info(app: tauri::AppHandle, dir: Option<String>) -> Result<DiskInfo, String> {
    let p = app.path();
    let id = app.config().identifier.clone();
    let mut dirs: Vec<PathBuf> = vec![];
    for d in [p.app_data_dir(), p.app_local_data_dir(), p.app_cache_dir()].into_iter().flatten() { dirs.push(d); }
    #[cfg(target_os = "macos")]
    if let Ok(h) = p.home_dir() { dirs.push(h.join("Library").join("WebKit").join(&id)); }
    let _ = &id;
    dirs.sort(); dirs.dedup();
    // verschachtelte Ordner nicht doppelt zählen
    let roots: Vec<PathBuf> = dirs.iter().filter(|d| !dirs.iter().any(|o| o != *d && d.starts_with(o))).cloned().collect();
    let data: u64 = roots.iter().map(|d| dir_size(d, 0)).sum();
    let backups = dir.as_ref().map(|d| dir_size(Path::new(d), 0)).unwrap_or(0);
    let probe = dir.as_ref().map(PathBuf::from).filter(|d| d.exists()).or_else(|| p.home_dir().ok()).unwrap_or_else(|| PathBuf::from("/"));
    let free = fs2::available_space(&probe).unwrap_or(0);
    let total = fs2::total_space(&probe).unwrap_or(0);
    Ok(DiskInfo { data, backups, free, total, data_dirs: roots.iter().filter(|d| d.exists()).map(|d| d.to_string_lossy().into_owned()).collect() })
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn write_rotate_read() {
        let d = std::env::temp_dir().join("findocu-bk-test"); let _ = fs::remove_dir_all(&d);
        let ds = d.to_string_lossy().into_owned();
        for i in 0..5 { bk_write(ds.clone(), format!("findocu-auto-2026-11-2{i}_10-00-00.json"), format!("{{\"n\":{i}}}"), 3).unwrap(); }
        fs::write(d.join("findocu-backup-2026-11-01.json"), "manuell").unwrap(); // fremde Datei bleibt
        let l = bk_list(ds.clone()).unwrap();
        assert_eq!(l.len(), 3); assert_eq!(l[0].name, "findocu-auto-2026-11-24_10-00-00.json");
        assert_eq!(bk_read(ds.clone(), l[0].name.clone()).unwrap(), "{\"n\":4}");
        assert!(bk_read(ds.clone(), "../x.json".into()).is_err());
        assert!(d.join("findocu-backup-2026-11-01.json").exists());
        assert!(dir_size(&d, 0) > 0);
        assert!(fs2::available_space(&d).unwrap() > 0);
    }
}

// ---------- v1.0.0: Teilen & im Finder/Explorer zeigen ----------
/// Datei im Finder / Explorer markiert anzeigen
#[tauri::command]
pub fn reveal_file(path: String) -> Result<(), String> {
    #[cfg(target_os = "macos")]
    let r = std::process::Command::new("open").arg("-R").arg(&path).spawn();
    #[cfg(windows)]
    let r = std::process::Command::new("explorer").arg(format!("/select,{}", path)).spawn();
    #[cfg(all(unix, not(target_os = "macos")))]
    let r = std::process::Command::new("xdg-open").arg(Path::new(&path).parent().unwrap_or(Path::new("/"))).spawn();
    r.map(|_| ()).map_err(|e| e.to_string())
}

/// macOS: System-Teilen-Menü (AirDrop, Mail, Nachrichten, WhatsApp …) an der Klickposition
#[tauri::command]
pub fn share_files(window: tauri::WebviewWindow, paths: Vec<String>, x: f64, y: f64) -> Result<(), String> {
    #[cfg(target_os = "macos")]
    {
        let w = window.clone();
        return window.run_on_main_thread(move || {
            if let Ok(v) = w.ns_view() { unsafe { share_mac::show(v, &paths, x, y) } }
        }).map_err(|e| e.to_string());
    }
    #[allow(unreachable_code)]
    { let _ = (window, paths, x, y); Err("Nur am Mac verfügbar".into()) }
}

#[cfg(target_os = "macos")]
mod share_mac {
    use objc2::AllocAnyThread;
    use objc2_app_kit::{NSSharingServicePicker, NSView};
    use objc2_foundation::{NSArray, NSPoint, NSRect, NSRectEdge, NSSize, NSString, NSURL};
    /// view_ptr = Inhaltsansicht des Fensters (nicht gespiegelt: y von unten); x/y = Klickposition in CSS-Pixeln von oben links
    pub unsafe fn show(view_ptr: *mut std::ffi::c_void, paths: &[String], x: f64, y: f64) {
        if view_ptr.is_null() || paths.is_empty() { return; }
        let urls: Vec<_> = paths.iter().map(|p| NSURL::fileURLWithPath(&NSString::from_str(p))).collect();
        let arr = NSArray::from_retained_slice(&urls);
        let items: &NSArray = &*((&*arr) as *const NSArray<NSURL> as *const NSArray);
        let picker = NSSharingServicePicker::initWithItems(NSSharingServicePicker::alloc(), items);
        let view: &NSView = &*(view_ptr as *const NSView);
        let b = view.bounds();
        let yy = if view.isFlipped() { y } else { b.size.height - y };
        let rect = NSRect::new(NSPoint::new(x.max(0.0), yy.max(0.0)), NSSize::new(1.0, 1.0));
        picker.showRelativeToRect_ofView_preferredEdge(rect, view, NSRectEdge::MinY);
        std::mem::forget(picker); // bleibt geöffnet, solange das Menü sichtbar ist
    }
}

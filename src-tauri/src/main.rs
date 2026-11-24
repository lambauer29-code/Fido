// Unter Windows im Release kein zusätzliches Konsolenfenster öffnen
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    findocu_lib::run()
}

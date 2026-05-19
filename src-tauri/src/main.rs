#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    if std::env::var("ADAPTIVE_SURFACE_EVENTKIT_SMOKE").as_deref() == Ok("1") {
        println!("{}", adaptive_surface_lib::eventkit_smoke_report());
        return;
    }

    adaptive_surface_lib::run()
}

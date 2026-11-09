// No console window for the release app (stdio still works when an agent launches `tinytasks mcp`).
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod app;
mod store;
mod launch;
mod mcp;
mod notify;
mod trayicon;
mod updates;

fn main() {
    let args: Vec<String> = std::env::args().collect();
    match args.get(1).map(String::as_str) {
        Some("mcp") => mcp::run(),
        _ => app::run(args.iter().any(|a| a == "--background") || launch::quiet_requested()),
    }
}

//! Getting the desktop app running from an agent's MCP server, and knowing when it already is.
//!
//! The app writes a heartbeat file every few seconds, so the MCP server only launches it when
//! it isn't running. On Windows it's launched through explorer.exe so that it starts outside
//! the agent's process tree: Store-packaged agents (Claude, Codex) virtualize everything they
//! launch and terminate it when they close. explorer.exe can't pass arguments, so "start
//! quietly in the tray" is passed along as a marker file instead of `--background`.

use crate::store;
use std::path::PathBuf;

const FRESH_SECS: i64 = 20;

#[cfg(windows)]
fn windows_install_exe(location: &str) -> Option<PathBuf> {
    let directory = std::path::Path::new(location.trim().trim_matches('"'));
    if !directory.is_absolute() {
        return None;
    }
    let exe = directory.join("tinytasks.exe");
    exe.is_file().then_some(exe)
}

#[cfg(windows)]
fn installed_windows_exe() -> Option<PathBuf> {
    use winreg::{enums::*, RegKey};

    // Tauri's NSIS installer writes InstallLocation under the product name.
    const UNINSTALL_KEY: &str = r"Software\Microsoft\Windows\CurrentVersion\Uninstall\TinyTasks";
    for hive in [HKEY_CURRENT_USER, HKEY_LOCAL_MACHINE] {
        for view in [KEY_WOW64_64KEY, KEY_WOW64_32KEY] {
            let root = RegKey::predef(hive);
            if let Ok(location) = root.open_subkey_with_flags(UNINSTALL_KEY, KEY_READ | view)
                .and_then(|key| key.get_value::<String, _>("InstallLocation"))
            {
                if let Some(exe) = windows_install_exe(&location) {
                    return Some(exe);
                }
            }
        }
    }
    None
}

fn alive_file() -> PathBuf {
    store::data_dir().join("app.alive")
}

fn quiet_file() -> PathBuf {
    store::data_dir().join("launch-quietly")
}

fn fresh(path: PathBuf) -> bool {
    std::fs::read_to_string(path)
        .ok()
        .and_then(|s| s.trim().parse::<i64>().ok())
        .is_some_and(|t| (store::now() - t).abs() < FRESH_SECS)
}

/// Called by the app's watcher thread.
pub fn heartbeat() {
    let _ = std::fs::write(alive_file(), store::now().to_string());
}

pub fn stopped() {
    let _ = std::fs::remove_file(alive_file());
}

pub fn app_alive() -> bool {
    fresh(alive_file())
}

/// Did an agent just ask for a quiet (tray-only) launch? Doesn't consume the request.
pub fn quiet_requested() -> bool {
    fresh(quiet_file())
}

pub fn clear_quiet_request() {
    let _ = std::fs::remove_file(quiet_file());
}

/// Start the app in the tray (so the user gets notified) unless it's already running.
pub fn ensure_app_running() {
    if std::env::var_os("TINYTASKS_NO_LAUNCH").is_some() || app_alive() {
        return;
    }
    // A source or portable MCP server can outlive an install. Let it launch the
    // registered desktop app so its own executable cannot take over the tray.
    #[cfg(windows)]
    let exe = installed_windows_exe().or_else(|| std::env::current_exe().ok());
    #[cfg(not(windows))]
    let exe = std::env::current_exe().ok();
    let Some(exe) = exe else { return };
    let quiet = |cmd: &mut std::process::Command| {
        cmd.stdin(std::process::Stdio::null())
            .stdout(std::process::Stdio::null())
            .stderr(std::process::Stdio::null());
    };

    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        const DETACHED_PROCESS: u32 = 0x0000_0008;
        const CREATE_NEW_PROCESS_GROUP: u32 = 0x0000_0200;
        // Windows hands every inheritable handle to children, including our stdio pipes,
        // which would keep the agent's pipe open as long as the app runs. Opt them out.
        extern "system" {
            fn GetStdHandle(which: u32) -> isize;
            fn SetHandleInformation(handle: isize, mask: u32, flags: u32) -> i32;
        }
        for which in [-10i32, -11, -12] {
            unsafe { SetHandleInformation(GetStdHandle(which as u32), 1, 0) };
        }

        let _ = std::fs::write(quiet_file(), store::now().to_string());
        let windir = std::env::var("SystemRoot").unwrap_or_else(|_| r"C:\Windows".into());
        let mut via_shell = std::process::Command::new(format!(r"{windir}\explorer.exe"));
        via_shell.arg(&exe).creation_flags(DETACHED_PROCESS);
        quiet(&mut via_shell);
        if via_shell.spawn().is_err() {
            let mut direct = std::process::Command::new(&exe);
            direct.arg("--background").creation_flags(DETACHED_PROCESS | CREATE_NEW_PROCESS_GROUP);
            quiet(&mut direct);
            let _ = direct.spawn();
        }
    }
    #[cfg(unix)]
    {
        use std::os::unix::process::CommandExt;
        let mut cmd = std::process::Command::new(&exe);
        cmd.arg("--background").process_group(0);
        quiet(&mut cmd);
        if let Ok(mut child) = cmd.spawn() {
            std::thread::spawn(move || child.wait()); // reap it; no zombies
        }
    }
}

#[cfg(all(test, windows))]
mod tests {
    use super::*;

    #[test]
    fn windows_install_location_accepts_nsis_quotes_and_skips_invalid_paths() {
        let directory = std::env::temp_dir().join(format!("tinytasks-{}", uuid::Uuid::new_v4()));
        std::fs::create_dir(&directory).unwrap();
        let executable = directory.join("tinytasks.exe");
        let quoted_location = format!("\"{}\"", directory.display());

        assert_eq!(windows_install_exe(&quoted_location), None);
        assert_eq!(windows_install_exe("TinyTasks"), None);
        std::fs::write(&executable, []).unwrap();
        let result = windows_install_exe(&quoted_location);
        std::fs::remove_file(&executable).unwrap();
        std::fs::remove_dir(&directory).unwrap();
        assert_eq!(result.as_deref(), Some(executable.as_path()));
    }
}

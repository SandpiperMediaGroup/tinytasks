//! Desktop notifications for new tasks.
//!
//! On Windows, toasts are tied to an AppUserModelID, and Windows looks up the name and icon
//! to show through a Start-menu shortcut carrying that ID. So the app (re)creates
//! "TinyTasks" in the Start menu on launch, which also makes it searchable and pinnable.
//! Clicking a toast opens the window. Elsewhere we use the notification plugin.

use crate::db::Task;
use tauri::AppHandle;

#[cfg(windows)]
const AUMID: &str = "SandpiperMediaGroup.TinyTasks";

/// Friendly name for the agent harness, from the name its MCP client reports.
pub fn agent_name(raw: &str) -> String {
    let r = raw.to_ascii_lowercase();
    let known = [
        ("claude-code", "Claude Code"),
        ("claude", "Claude"),
        ("cursor", "Cursor"),
        ("codex", "Codex"),
        ("openai", "ChatGPT"),
        ("gemini", "Gemini"),
        ("windsurf", "Windsurf"),
        ("zed", "Zed"),
        ("copilot", "Copilot"),
        ("visual studio code", "VS Code"),
    ];
    known
        .iter()
        .find(|(k, _)| r.contains(k))
        .map(|(_, v)| v.to_string())
        .unwrap_or_else(|| if raw.is_empty() { "your agent".into() } else { raw.into() })
}

/// Call before any window exists, so the taskbar groups our windows with the shortcut.
pub fn init_process() {
    #[cfg(windows)]
    unsafe {
        let _ = windows::Win32::UI::Shell::SetCurrentProcessExplicitAppUserModelID(&windows::core::HSTRING::from(AUMID));
    }
}

/// Returns true if the notification identity was just (re)registered. Windows needs a few
/// seconds to pick up a new or changed shortcut and silently drops toasts until then.
pub fn init(_app: &AppHandle) -> bool {
    #[cfg(windows)]
    {
        let fresh = start_menu_shortcut().unwrap_or_else(|e| {
            eprintln!("tinytasks: couldn't create Start menu shortcut: {e}");
            false
        });
        if let Err(e) = register_aumid() {
            eprintln!("tinytasks: couldn't register notification identity: {e}");
        }
        fresh
    }
    #[cfg(not(windows))]
    false
}

/// %APPDATA%\Microsoft\Windows\Start Menu\Programs\TinyTasks.lnk -> this exe, tagged with AUMID.
/// Only rewritten when missing or when the exe path / ID changed; returns whether it was.
#[cfg(windows)]
fn start_menu_shortcut() -> windows::core::Result<bool> {
    use windows::core::{Interface, HSTRING, PWSTR};
    use windows::Win32::Storage::EnhancedStorage::PKEY_AppUserModel_ID;
    use windows::Win32::System::Com::StructuredStorage::PROPVARIANT;
    use windows::Win32::System::Com::{CoCreateInstance, CoInitializeEx, CoTaskMemAlloc, IPersistFile, CLSCTX_INPROC_SERVER, COINIT_APARTMENTTHREADED};
    use windows::Win32::System::Variant::VT_LPWSTR;
    use windows::Win32::UI::Shell::PropertiesSystem::IPropertyStore;
    use windows::Win32::UI::Shell::{IShellLinkW, ShellLink};

    let exe = std::env::current_exe().map_err(|e| windows::core::Error::new(windows::core::HRESULT(-1), e.to_string()))?;
    let Some(programs) = dirs::data_dir().map(|d| d.join(r"Microsoft\Windows\Start Menu\Programs")) else { return Ok(false) };
    let lnk = programs.join("TinyTasks.lnk");
    let stamp_file = crate::db::data_dir().join("shortcut");
    let stamp = format!("{}\n{AUMID}", exe.display());
    if lnk.exists() && std::fs::read_to_string(&stamp_file).is_ok_and(|s| s == stamp) {
        return Ok(false);
    }
    unsafe {
        let _ = CoInitializeEx(None, COINIT_APARTMENTTHREADED); // already initialized on the UI thread is fine
        let link: IShellLinkW = CoCreateInstance(&ShellLink, None, CLSCTX_INPROC_SERVER)?;
        link.SetPath(&HSTRING::from(exe.as_os_str()))?;
        link.SetDescription(&HSTRING::from("Your agents' to-dos for you"))?;

        // PKEY_AppUserModel_ID wants a VT_LPWSTR allocated with CoTaskMemAlloc
        // (freed by PROPVARIANT's Drop via PropVariantClear).
        let wide: Vec<u16> = AUMID.encode_utf16().chain(Some(0)).collect();
        let buf = CoTaskMemAlloc(wide.len() * 2) as *mut u16;
        std::ptr::copy_nonoverlapping(wide.as_ptr(), buf, wide.len());
        let mut pv = PROPVARIANT::default();
        (*pv.Anonymous.Anonymous).vt = VT_LPWSTR;
        (*pv.Anonymous.Anonymous).Anonymous.pwszVal = PWSTR(buf);

        let store: IPropertyStore = link.cast()?;
        store.SetValue(&PKEY_AppUserModel_ID, &pv)?;
        store.Commit()?;
        link.cast::<IPersistFile>()?.Save(&HSTRING::from(lnk.as_os_str()), true)?;
    }
    let _ = std::fs::write(stamp_file, stamp);
    Ok(true)
}

/// Belt and braces: also describe the ID in the registry (used by newer Windows builds).
#[cfg(windows)]
fn register_aumid() -> std::io::Result<()> {
    use winreg::{enums::HKEY_CURRENT_USER, RegKey};
    let icon = crate::db::data_dir().join("icon.png");
    std::fs::write(&icon, include_bytes!("../icons/128x128@2x.png"))?;
    let (key, _) = RegKey::predef(HKEY_CURRENT_USER)
        .create_subkey(format!(r"Software\Classes\AppUserModelId\{AUMID}"))?;
    key.set_value("DisplayName", &"TinyTasks")?;
    key.set_value("IconUri", &icon.to_string_lossy().to_string())?;
    Ok(())
}

pub fn new_tasks(app: &AppHandle, tasks: &[Task]) {
    let Some(first) = tasks.first() else { return };
    let same_agent = tasks.iter().all(|t| t.agent == first.agent);
    let same_chat = tasks.iter().all(|t| t.chat == first.chat);
    let from = if same_agent { format!(" from {}", agent_name(&first.agent)) } else { String::new() };

    let (title, body) = if tasks.len() == 1 {
        (format!("New task{from}"), first.title.clone())
    } else {
        let mut lines: Vec<String> = tasks.iter().take(4).map(|t| format!("• {}", t.title)).collect();
        if tasks.len() > 4 {
            lines.push(format!("and {} more", tasks.len() - 4));
        }
        (format!("{} new tasks{from}", tasks.len()), lines.join("\n"))
    };
    let chat = if same_chat { first.chat.clone() } else { String::new() };
    show(app, &title, &body, &chat);
}

#[cfg(windows)]
fn show(app: &AppHandle, title: &str, body: &str, chat: &str) {
    use tauri_winrt_notification::Toast;
    let app = app.clone();
    let mut toast = Toast::new(AUMID).title(title).text1(body);
    if !chat.is_empty() {
        toast = toast.text2(chat);
    }
    let _ = toast
        .on_activated(move |_| {
            crate::app::show(&app);
            Ok(())
        })
        .show();
}

#[cfg(not(windows))]
fn show(app: &AppHandle, title: &str, body: &str, chat: &str) {
    use tauri_plugin_notification::NotificationExt;
    let body = if chat.is_empty() { body.to_string() } else { format!("{body}\n{chat}") };
    let _ = app.notification().builder().title(title).body(body).show();
}

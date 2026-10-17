#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::{io::{Read, Write}, net::{TcpStream, SocketAddr}, sync::Mutex, time::{Duration, Instant}};
use serde::Serialize;
use tauri::{AppHandle, Emitter, Manager, State};
use tauri_plugin_shell::{ShellExt, process::CommandChild};
use tauri_plugin_updater::{Update, UpdaterExt};

struct BackendState(Mutex<Option<CommandChild>>);
struct PendingUpdate(Mutex<Option<Update>>);

#[derive(Serialize)]
struct UpdateInfo { version: String, current_version: String, notes: Option<String> }

#[tauri::command]
fn desktop_version() -> &'static str { env!("CARGO_PKG_VERSION") }

#[tauri::command]
async fn desktop_check_update(app: AppHandle, pending: State<'_, PendingUpdate>) -> Result<Option<UpdateInfo>, String> {
    if option_env!("BZTUNE_RELEASE_SIGNED").is_none() {
        return Err("Atualizações estarão disponíveis na versão assinada do BZtune.".into());
    }
    let update = app.updater().map_err(|e| e.to_string())?.check().await.map_err(|e| e.to_string())?;
    let info = update.as_ref().map(|u| UpdateInfo {
        version: u.version.clone(), current_version: u.current_version.clone(), notes: u.body.clone()
    });
    *pending.0.lock().map_err(|_| "Bloqueio de atualização".to_string())? = update;
    Ok(info)
}

#[tauri::command]
async fn desktop_install_update(app: AppHandle, pending: State<'_, PendingUpdate>) -> Result<(), String> {
    if option_env!("BZTUNE_RELEASE_SIGNED").is_none() {
        return Err("Instalação de atualizações não habilitada neste build.".into());
    }
    let update = pending.0.lock().map_err(|_| "Bloqueio de atualização".to_string())?
        .take().ok_or_else(|| "Procure uma atualização primeiro.".to_string())?;
    let app_progress = app.clone();
    let app_done = app.clone();
    let mut bytes = 0usize;
    update.download_and_install(
        move |chunk, total| {
            bytes += chunk;
            let _ = app_progress.emit("bztune-update-progress", (bytes as u64, total));
        },
        move || { let _ = app_done.emit("bztune-update-finished", true); }
    ).await.map_err(|e| e.to_string())?;
    app.restart();
}

fn backend_ready(token: &str) -> bool {
    let addr: SocketAddr = "127.0.0.1:5000".parse().unwrap();
    let Ok(mut stream) = TcpStream::connect_timeout(&addr, Duration::from_millis(500)) else { return false; };
    let _ = stream.set_read_timeout(Some(Duration::from_millis(600)));
    let req = format!("GET /__desktop_health HTTP/1.1\r\nHost: 127.0.0.1\r\nX-BZtune-Launch: {}\r\nConnection: close\r\n\r\n", token);
    if stream.write_all(req.as_bytes()).is_err() { return false; }
    let mut response = String::new();
    if stream.read_to_string(&mut response).is_err() { return false; }
    response.starts_with("HTTP/1.1 200") && response.contains("\"desktop\":true")
}

fn launch_backend(app: &AppHandle) -> Result<(), Box<dyn std::error::Error>> {
    let token = format!("{}-{}", std::process::id(), std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH)?.as_nanos());
    let resources = app.path().resource_dir()?;
    let ffmpeg_dir = resources.join("bin");
    let mut path = std::ffi::OsString::from(ffmpeg_dir.as_os_str());
    path.push(";");
    path.push(std::env::var_os("PATH").unwrap_or_default());
    let (_rx, child) = app.shell().sidecar("bztune-backend")?
        .env("BZTUNE_DESKTOP_MODE", "1")
        .env("BZTUNE_LAUNCH_TOKEN", &token)
        .env("PATH", path.to_string_lossy().to_string())
        .spawn()?;
    *app.state::<BackendState>().0.lock().map_err(|_| "Backend mutex poison")? = Some(child);
    let handle = app.clone();
    std::thread::spawn(move || {
        let until = Instant::now() + Duration::from_secs(45);
        while Instant::now() < until {
            if backend_ready(&token) {
                if let Some(window) = handle.get_webview_window("main") { let _ = window.show(); }
                return;
            }
            std::thread::sleep(Duration::from_millis(300));
        }
        use tauri_plugin_dialog::{DialogExt, MessageDialogKind};
        handle.dialog().message("O serviço local não iniciou. Verifique se a porta 5000 está livre. Seus arquivos não foram alterados.")
            .kind(MessageDialogKind::Error).title("BZtune Desktop").show(|_| {});
        handle.exit(2);
    });
    Ok(())
}

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .manage(BackendState(Mutex::new(None)))
        .manage(PendingUpdate(Mutex::new(None)))
        .invoke_handler(tauri::generate_handler![desktop_version, desktop_check_update, desktop_install_update])
        .setup(|app| {
            if cfg!(debug_assertions) {
                if let Some(window) = app.get_webview_window("main") { window.show()?; }
            } else {
                launch_backend(app.handle())?;
            }
            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("Não foi possível construir o BZtune Desktop")
        .run(|app, event| {
            if let tauri::RunEvent::Exit = event {
                if let Some(state) = app.try_state::<BackendState>() {
                    if let Ok(mut guard) = state.0.lock() {
                        if let Some(child) = guard.take() { let _ = child.kill(); }
                    }
                }
            }
        });
}

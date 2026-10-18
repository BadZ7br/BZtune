#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::{io::{Read, Write}, net::{TcpStream, SocketAddr}, sync::{Mutex, atomic::{AtomicBool, Ordering}}, time::{Duration, Instant}};
use serde::Serialize;
use tauri::{AppHandle, Emitter, Manager, State};
use tauri_plugin_shell::{ShellExt, process::CommandChild};
use tauri_plugin_updater::{Update, UpdaterExt};

struct BackendState(Mutex<Option<CommandChild>>);
struct BackendReady(AtomicBool);
struct PendingUpdate(Mutex<Option<Update>>);

#[derive(Serialize)]
struct UpdateInfo { version: String, current_version: String, notes: Option<String> }

#[tauri::command]
fn desktop_backend_ready(ready: State<'_, BackendReady>) -> bool { ready.0.load(Ordering::Acquire) }

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

// Sonda HTTP nativa: não depende do WebView nem requer terminal.
fn backend_http(method: &str, path: &str, origin: Option<&str>, token: Option<&str>, preflight: bool) -> Result<String, String> {
    let addr: SocketAddr = "127.0.0.1:5000".parse().map_err(|e| format!("Endereco invalido: {e}"))?;
    let mut stream = TcpStream::connect_timeout(&addr, Duration::from_millis(450))
        .map_err(|e| format!("Porta 5000 inacessivel: {e}"))?;
    stream.set_read_timeout(Some(Duration::from_secs(3))).map_err(|e| e.to_string())?;
    stream.set_write_timeout(Some(Duration::from_secs(2))).map_err(|e| e.to_string())?;
    let mut headers = String::new();
    if let Some(value) = token { headers.push_str(&format!("X-BZtune-Launch: {value}\r\n")); }
    if let Some(value) = origin { headers.push_str(&format!("Origin: {value}\r\n")); }
    if preflight {
        headers.push_str("Access-Control-Request-Method: GET\r\nAccess-Control-Request-Private-Network: true\r\n");
    }
    let req = format!("{method} {path} HTTP/1.1\r\nHost: 127.0.0.1:5000\r\nConnection: close\r\n{headers}\r\n");
    stream.write_all(req.as_bytes()).map_err(|e| e.to_string())?;
    let mut response = String::new();
    stream.read_to_string(&mut response).map_err(|e| e.to_string())?;
    Ok(response)
}

fn backend_ready(token: &str) -> bool {
    let Ok(reply) = backend_http("GET", "/__desktop_health", None, Some(token), false) else { return false; };
    reply.starts_with("HTTP/1.1 200") && reply.contains("\"desktop\":true")
}

// Testa rotas locais e preflight sem depender de MusicBrainz ou YouTube.
fn verify_backend(token: &str) -> Result<(), String> {
    if !backend_ready(token) {
        return Err("O backend nao respondeu a autenticacao de inicializacao.".into());
    }
    const ORIGIN: &str = "http://tauri.localhost";
    let routes = [
        ("/", "API principal"),
        ("/api/bztune/stats/summary?period=month", "Estatisticas"),
        ("/api/bztune/maintenance/diagnostics", "Diagnostico e backup"),
    ];
    for (route, name) in routes {
        let reply = backend_http("GET", route, Some(ORIGIN), None, false)?;
        if !reply.starts_with("HTTP/1.1 200") {
            return Err(format!("{name} nao respondeu HTTP 200."));
        }
        if !reply.to_ascii_lowercase().contains("access-control-allow-origin: http://tauri.localhost") {
            return Err(format!("{name}: WebView sem permissao CORS."));
        }
    }
    let check = backend_http("OPTIONS", "/api/library/tracks", Some(ORIGIN), None, true)?;
    let lower = check.to_ascii_lowercase();
    if !check.starts_with("HTTP/1.1 200")
        || !lower.contains("access-control-allow-origin: http://tauri.localhost")
        || !lower.contains("access-control-allow-private-network: true")
    {
        return Err("Biblioteca: preflight de rede local bloqueado pelo CORS/PNA.".into());
    }
    Ok(())
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
        // No Windows usa um Job Object: encerra também o subprocesso do PyInstaller.
        .set_process_group(true)
        .spawn()?;
    *app.state::<BackendState>().0.lock().map_err(|_| "Backend mutex poison")? = Some(child);
    let handle = app.clone();
    std::thread::spawn(move || {
        let until = Instant::now() + Duration::from_secs(45);
        let mut last_error = String::from("O backend nao iniciou dentro do prazo.");
        while Instant::now() < until {
            if backend_ready(&token) {
                match verify_backend(&token) {
                    Ok(()) => {
                        handle.state::<BackendReady>().0.store(true, Ordering::Release);
                        if let Some(window) = handle.get_webview_window("main") { let _ = window.show(); }
                        return;
                    }
                    Err(message) => { last_error = message; }
                }
            }
            std::thread::sleep(Duration::from_millis(450));
        }
        use tauri_plugin_dialog::{DialogExt, MessageDialogKind};
        let problem = format!("Falha ao iniciar os serviços do BZtune: {last_error}\nA biblioteca nao foi apagada.\nVerifique se a porta 5000 esta livre.");
        handle.dialog().message(problem)
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
        .manage(BackendReady(AtomicBool::new(false)))
        .manage(PendingUpdate(Mutex::new(None)))
        .invoke_handler(tauri::generate_handler![desktop_version, desktop_backend_ready, desktop_check_update, desktop_install_update])
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

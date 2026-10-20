#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::{io::{Read, Write}, net::{TcpStream, SocketAddr}, sync::{Arc, Mutex, atomic::{AtomicBool, Ordering}}, time::{Duration, Instant}};
use serde::Serialize;
use tauri::{AppHandle, Emitter, Manager, State};
use tauri_plugin_shell::{ShellExt, process::CommandChild};
use tauri_plugin_updater::{Update, UpdaterExt};
mod native_playlists;

struct BackendState(Mutex<Option<CommandChild>>);
struct BackendReady(AtomicBool);
struct PendingInstall {
    update: Update,
    backend_stopped: Arc<AtomicBool>,
}
struct PendingUpdate(Mutex<Option<PendingInstall>>);

const UPDATE_CHECK_TIMEOUT: Duration = Duration::from_secs(30);
const UPDATE_DOWNLOAD_TIMEOUT: Duration = Duration::from_secs(10 * 60);

fn update_error(error: tauri_plugin_updater::Error, timeout_code: &str) -> String {
    match error {
        tauri_plugin_updater::Error::Reqwest(ref request) if request.is_timeout() => timeout_code.into(),
        _ => error.to_string(),
    }
}

// O updater do Windows encerra o processo diretamente e pode nao disparar RunEvent::Exit.
// Finalizar somente o sidecar iniciado por esta instancia, antes de substituir arquivos.
fn stop_backend(app: &AppHandle) -> bool {
    if let Some(ready) = app.try_state::<BackendReady>() {
        ready.0.store(false, Ordering::Release);
    }
    if let Some(state) = app.try_state::<BackendState>() {
        if let Ok(mut guard) = state.0.lock() {
            if let Some(child) = guard.take() {
                let _ = child.kill();
                return true;
            }
        }
    }
    false
}

#[derive(Serialize)]
struct UpdateInfo { version: String, current_version: String, notes: Option<String> }

#[tauri::command]
fn desktop_backend_ready(ready: State<'_, BackendReady>) -> bool { ready.0.load(Ordering::Acquire) }

#[tauri::command]
fn desktop_version(app: AppHandle) -> String { app.package_info().version.to_string() }

#[derive(Serialize)]
struct UpdateStatus {
    version: String,
    channel: &'static str,
    enabled: bool,
}

// Read the effective configuration, including overrides used by isolated RC builds.
// This reports capability, not network availability or successful signature validation.
#[tauri::command]
fn desktop_update_status(app: AppHandle) -> UpdateStatus {
    let config = app.config();
    let updater = config.plugins.0.get("updater");
    let endpoints = updater.and_then(|v| v.get("endpoints")).and_then(|v| v.as_array());
    let channel = match endpoints {
        Some(values) if values.len() == 1 && values[0].as_str() == Some("https://github.com/BadZ7br/BZtune/releases/latest/download/latest.json") => "public",
        Some(values) if values.len() == 1 && values[0].as_str() == Some("http://127.0.0.1:8765/latest.json") => "local",
        Some(values) if !values.is_empty() && values.iter().all(|v| v.as_str().is_some_and(|url| url.starts_with("https://"))) => "custom",
        _ => "unconfigured",
    };
    let has_key = updater.and_then(|v| v.get("pubkey")).and_then(|v| v.as_str())
        .is_some_and(|key| !key.trim().is_empty() && key != "BZTUNE_REPLACE_WITH_SIGNING_PUBLIC_KEY");
    let signed_build = option_env!("BZTUNE_RELEASE_SIGNED").is_some();
    UpdateStatus {
        version: desktop_version(app),
        channel: if !signed_build { "preview" } else { channel },
        enabled: signed_build && has_key && channel != "unconfigured",
    }
}

#[tauri::command]
async fn desktop_check_update(app: AppHandle, pending: State<'_, PendingUpdate>) -> Result<Option<UpdateInfo>, String> {
    if !desktop_update_status(app.clone()).enabled {
        return Err("Atualizações estarão disponíveis na versão assinada do BZtune.".into());
    }
    // Uma consulta que falha não pode deixar uma oferta anterior pronta para instalar.
    *pending.0.lock().map_err(|_| "Bloqueio de atualização".to_string())? = None;
    let on_update_exit = app.clone();
    let backend_stopped = Arc::new(AtomicBool::new(false));
    let stopped_on_exit = backend_stopped.clone();
    let update = app.updater_builder()
        .timeout(UPDATE_CHECK_TIMEOUT)
        .on_before_exit(move || {
            stopped_on_exit.store(stop_backend(&on_update_exit), Ordering::Release);
        })
        .build().map_err(|e| e.to_string())?
        .check().await.map_err(|e| update_error(e, "BZTUNE_UPDATE_CHECK_TIMEOUT"))?;
    let info = update.as_ref().map(|u| UpdateInfo {
        version: u.version.clone(), current_version: u.current_version.clone(), notes: u.body.clone()
    });
    *pending.0.lock().map_err(|_| "Bloqueio de atualização".to_string())? =
        update.map(|update| PendingInstall { update, backend_stopped });
    Ok(info)
}

#[tauri::command]
async fn desktop_install_update(app: AppHandle, pending: State<'_, PendingUpdate>) -> Result<(), String> {
    if !desktop_update_status(app.clone()).enabled {
        return Err("Instalação de atualizações não habilitada neste build.".into());
    }
    let PendingInstall { mut update, backend_stopped } = pending.0.lock().map_err(|_| "Bloqueio de atualização".to_string())?
        .take().ok_or_else(|| "Procure uma atualização primeiro.".to_string())?;
    // O plugin não copia o timeout do builder para Update. Este prazo cobre a
    // requisição inteira do pacote, inclusive leitura do corpo, sem limitar o instalador.
    update.timeout = Some(UPDATE_DOWNLOAD_TIMEOUT);
    let app_progress = app.clone();
    let app_done = app.clone();
    let mut bytes = 0usize;
    // download() verifies the signature after its download-finished callback.
    let result = match update.download(
        move |chunk, total| {
            bytes += chunk;
            let _ = app_progress.emit("bztune-update-progress", (bytes as u64, total));
        },
        move || { let _ = app_done.emit("bztune-update-finished", true); }
    ).await {
        Ok(bytes) => {
            let _ = app.emit("bztune-update-verified", true);
            // install() verifies the same bytes again before launching the installer.
            update.install(bytes)
        }
        Err(error) => Err(error),
    };
    if let Err(error) = result {
        // Network/signature failures happen before the shutdown hook. Do not
        // disturb a running backend (or an external development server).
        if !backend_stopped.load(Ordering::Acquire) {
            return Err(update_error(error, "BZTUNE_UPDATE_DOWNLOAD_TIMEOUT"));
        }
        let _ = app.emit("bztune-backend-restoring", true);
        let recovery_app = app.clone();
        let restored = tauri::async_runtime::spawn_blocking(move || restore_backend(&recovery_app)).await;
        return Err(match restored {
            Ok(Ok(())) => "BZTUNE_UPDATE_BACKEND_RESTORED".into(),
            _ => "BZTUNE_UPDATE_BACKEND_UNAVAILABLE".into(),
        });
    }
    // No Windows, o Tauri já encerra o app e o NSIS reinicia após instalar.
    // Reiniciar aqui poderia disputar os arquivos enquanto o setup os substitui.
    #[cfg(not(target_os = "windows"))]
    app.restart();
    #[cfg(target_os = "windows")]
    Ok(())
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

fn start_backend(app: &AppHandle) -> Result<String, Box<dyn std::error::Error>> {
    app.state::<BackendReady>().0.store(false, Ordering::Release);
    // Keep ownership while spawning: never replace an existing child handle.
    let backend = app.state::<BackendState>();
    let mut guard = backend.0.lock().map_err(|_| "Backend mutex poison")?;
    if guard.is_some() { return Err("O serviço local já possui uma instância gerenciada.".into()); }
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
    *guard = Some(child);
    Ok(token)
}

fn wait_backend(token: &str) -> Result<(), String> {
    let until = Instant::now() + Duration::from_secs(45);
    let mut last_error = String::from("O backend nao iniciou dentro do prazo.");
    while Instant::now() < until {
        match verify_backend(token) {
            Ok(()) => return Ok(()),
            Err(message) => last_error = message,
        }
        std::thread::sleep(Duration::from_millis(450));
    }
    Err(last_error)
}

fn restore_backend(app: &AppHandle) -> Result<(), String> {
    let token = start_backend(app).map_err(|e| e.to_string())?;
    if let Err(error) = wait_backend(&token) {
        // Only the replacement owned by this app is stopped. Recovery must not
        // close the application or leave a failed child registered as ready.
        stop_backend(app);
        return Err(error);
    }
    app.state::<BackendReady>().0.store(true, Ordering::Release);
    Ok(())
}

fn launch_backend(app: &AppHandle) -> Result<(), Box<dyn std::error::Error>> {
    let token = start_backend(app)?;
    let handle = app.clone();
    std::thread::spawn(move || {
        let last_error = match wait_backend(&token) {
            Ok(()) => {
                handle.state::<BackendReady>().0.store(true, Ordering::Release);
                if let Some(window) = handle.get_webview_window("main") { let _ = window.show(); }
                return;
            }
            Err(error) => error,
        };
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
        .invoke_handler(tauri::generate_handler![desktop_version, desktop_update_status, desktop_backend_ready, desktop_check_update, desktop_install_update, native_playlists::native_playlists])
        .setup(|app| {
            app.manage(native_playlists::store(app.handle())?);
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
                stop_backend(app);
            }
        });
}

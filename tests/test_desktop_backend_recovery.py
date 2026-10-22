"""Recovery wiring plus the real Rust recovery helpers with process/probe adapters."""
from pathlib import Path
import shutil
import subprocess
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[1]
SOURCE = (ROOT / 'desktop/src-tauri/src/main.rs').read_text(encoding='utf-8')


def function(name):
    start = SOURCE.index('fn ' + name + '(')
    body = SOURCE.index('{', start)
    depth = 1
    end = body + 1
    while depth:
        depth += (SOURCE[end] == '{') - (SOURCE[end] == '}')
        end += 1
    return SOURCE[start:end]


class BackendRecoveryTests(unittest.TestCase):
    def test_only_a_shutdown_from_the_install_hook_triggers_recovery(self):
        install = SOURCE.split('async fn desktop_install_update(', 1)[1].split('fn backend_http(', 1)[0]
        self.assertIn('stopped_on_exit.store(stop_backend(&on_update_exit), Ordering::Release)', SOURCE)
        self.assertIn('update.map(|update| PendingInstall { update, backend_stopped })', SOURCE)
        self.assertLess(install.index('if let Err(error) = result'), install.index('backend_stopped.load'))
        self.assertLess(install.index('if !backend_stopped.load'), install.index('spawn_blocking'))
        self.assertIn('restore_backend(&recovery_app)', install)
        self.assertIn('Ok(Ok(())) => "BZTUNE_UPDATE_BACKEND_RESTORED"', install)
        self.assertIn('"BZTUNE_UPDATE_BACKEND_UNAVAILABLE"', install)

    def test_start_keeps_process_ownership_and_recovery_reuses_authenticated_probes(self):
        start = function('start_backend')
        self.assertLess(start.index('guard.is_some()'), start.index('.spawn()?'))
        self.assertIn('*guard = Some(child)', start)
        wait = function('wait_backend')
        self.assertIn('verify_backend(token)', wait)
        self.assertIn('Duration::from_secs(45)', wait)
        verify = function('verify_backend')
        self.assertIn('backend_ready(token)', verify)
        self.assertIn('access-control-allow-origin: http://tauri.localhost', verify)
        self.assertIn('access-control-allow-private-network: true', verify)
        self.assertNotIn('.exit(', function('restore_backend'))

    @unittest.skipUnless(shutil.which('rustc'), 'Rust toolchain is required for native helper tests')
    def test_real_rust_stop_and_recovery_helpers(self):
        harness = r'''
use std::{any::Any, cell::RefCell, sync::{Arc, Mutex, atomic::{AtomicBool, Ordering}}};
struct BackendReady(AtomicBool);
struct BackendState(Mutex<Option<Child>>);
struct Child(Arc<Mutex<Vec<&'static str>>>);
impl Child { fn kill(self) -> Result<(), ()> { self.0.lock().unwrap().push("kill"); Ok(()) } }
struct AppHandle {
    ready: Arc<BackendReady>, state: BackendState,
    trace: Arc<Mutex<Vec<&'static str>>>, fail_start: bool, fail_verify: bool,
}
impl AppHandle {
    fn state<T: Any>(&self) -> &T {
        self.try_state().unwrap()
    }
    fn try_state<T: Any>(&self) -> Option<&T> {
        (&*self.ready as &dyn Any).downcast_ref::<T>()
            .or_else(|| (&self.state as &dyn Any).downcast_ref::<T>())
    }
}
thread_local! { static PROBE: RefCell<Option<Box<dyn Fn(&str) -> Result<(), String>>>> = RefCell::new(None); }
fn start_backend(app: &AppHandle) -> Result<String, Box<dyn std::error::Error>> {
    app.ready.0.store(false, Ordering::Release);
    app.trace.lock().unwrap().push("start");
    if app.fail_start { return Err("spawn failed".into()); }
    *app.state.0.lock().unwrap() = Some(Child(app.trace.clone()));
    let ready = app.ready.clone(); let trace = app.trace.clone(); let fail = app.fail_verify;
    PROBE.with(|p| *p.borrow_mut() = Some(Box::new(move |token| {
        assert_eq!(token, "fresh-token");
        assert!(!ready.0.load(Ordering::Acquire), "must not be ready before verification");
        trace.lock().unwrap().push("verify");
        if fail { Err("health/authentication/CORS failed".into()) } else { Ok(()) }
    })));
    Ok("fresh-token".into())
}
fn wait_backend(token: &str) -> Result<(), String> {
    PROBE.with(|p| p.borrow().as_ref().unwrap()(token))
}
'''
        harness += function('stop_backend') + '\n' + function('restore_backend')
        harness += r'''
fn fixture(fail_start: bool, fail_verify: bool) -> AppHandle {
    AppHandle { ready: Arc::new(BackendReady(AtomicBool::new(false))),
        state: BackendState(Mutex::new(None)), trace: Arc::new(Mutex::new(vec![])), fail_start, fail_verify }
}
#[test] fn ready_only_after_successful_verification() {
    let app = fixture(false, false);
    assert_eq!(restore_backend(&app), Ok(()));
    assert!(app.ready.0.load(Ordering::Acquire));
    assert!(app.state.0.lock().unwrap().is_some());
    assert_eq!(*app.trace.lock().unwrap(), vec!["start", "verify"]);
}
#[test] fn failed_health_check_cleans_up_replacement_and_stays_unavailable() {
    let app = fixture(false, true);
    assert!(restore_backend(&app).is_err());
    assert!(!app.ready.0.load(Ordering::Acquire));
    assert!(app.state.0.lock().unwrap().is_none());
    assert_eq!(*app.trace.lock().unwrap(), vec!["start", "verify", "kill"]);
}
#[test] fn spawn_failure_does_not_probe_or_report_ready() {
    let app = fixture(true, false);
    assert!(restore_backend(&app).is_err());
    assert!(!app.ready.0.load(Ordering::Acquire));
    assert!(app.state.0.lock().unwrap().is_none());
    assert_eq!(*app.trace.lock().unwrap(), vec!["start"]);
}
#[test] fn stop_clears_ready_and_kills_only_the_owned_child() {
    let app = fixture(false, false);
    app.ready.0.store(true, Ordering::Release);
    *app.state.0.lock().unwrap() = Some(Child(app.trace.clone()));
    assert!(stop_backend(&app));
    assert!(!app.ready.0.load(Ordering::Acquire));
    assert!(app.state.0.lock().unwrap().is_none());
    assert_eq!(*app.trace.lock().unwrap(), vec!["kill"]);
}
#[test] fn no_owned_child_does_not_mark_a_shutdown_for_recovery() {
    let app = fixture(false, false);
    assert!(!stop_backend(&app));
    assert!(app.trace.lock().unwrap().is_empty());
}
'''
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory)
            src, exe = path / 'recovery.rs', path / 'recovery-tests.exe'
            src.write_text(harness, encoding='utf-8')
            # Compilation includes compiler/linker startup on a cold Windows runner.
            # Give that phase its own budget; the recovery tests still have 15s to run.
            compiled = subprocess.run(['rustc', '--edition=2021', '--test', str(src), '-o', str(exe)], capture_output=True, text=True, timeout=180)
            self.assertEqual(compiled.returncode, 0, compiled.stderr)
            result = subprocess.run([str(exe)], capture_output=True, text=True, timeout=15)
            self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
            self.assertIn('5 passed', result.stdout)

use std::time::{Duration, Instant};

/// No recovery may access files until termination has been positively observed.
pub fn wait_for_exit(
    mut poll: impl FnMut() -> Result<Option<bool>, String>,
    kill: impl FnOnce() -> Result<(), String>,
    timeout: Duration,
    grace: Duration,
) -> Result<bool, String> {
    let deadline = Instant::now() + timeout;
    loop {
        match poll() {
            Ok(Some(success)) => return Ok(success),
            Ok(None) => {},
            Err(error) => { let _ = kill(); return Err(error); }
        }
        if Instant::now() >= deadline { break; }
        std::thread::sleep(Duration::from_millis(20));
    }
    kill()?;
    let deadline = Instant::now() + grace;
    loop {
        if poll()?.is_some() { return Ok(false); }
        if Instant::now() >= deadline {
            return Err("Não foi possível confirmar o encerramento da restauração. A biblioteca permanece bloqueada; feche e reabra o aplicativo.".into());
        }
        std::thread::sleep(Duration::from_millis(20));
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::cell::Cell;
    #[test] fn success_does_not_kill() {
        assert!(wait_for_exit(|| Ok(Some(true)), || panic!("must not kill"), Duration::ZERO, Duration::ZERO).unwrap());
    }
    #[test] fn timeout_requires_positive_exit_confirmation() {
        let killed = Cell::new(false);
        assert!(!wait_for_exit(|| Ok(if killed.get() {Some(false)} else {None}), || {killed.set(true);Ok(())}, Duration::ZERO, Duration::ZERO).unwrap());
    }
    #[test] fn unconfirmed_termination_fails_closed() {
        assert!(wait_for_exit(|| Ok(None), || Ok(()), Duration::ZERO, Duration::ZERO).is_err());
        assert!(wait_for_exit(|| Ok(None), || Err("kill failed".into()), Duration::ZERO, Duration::ZERO).is_err());
    }
}

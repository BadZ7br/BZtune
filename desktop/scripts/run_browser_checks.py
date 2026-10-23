"""Run every browser suite and retain failures in GitHub annotations and summary."""
from pathlib import Path
from run_release_checks import run_browser_checks

if __name__ == '__main__':
    raise SystemExit(run_browser_checks(Path(__file__).resolve().parents[2]))

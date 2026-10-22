"""Run release checks fail-closed and expose actionable errors in public annotations."""
from pathlib import Path
import os
import subprocess
import sys


def run_checks(root: Path, runner=subprocess.run) -> int:
    node_tests = sorted(str(path.relative_to(root)) for path in (root / 'tests').glob('*.test.mjs'))
    commands = [('Python', [sys.executable, '-m', 'unittest', 'discover', '-s', 'tests', '-v']),
                ('JavaScript', ['node', '--test', *node_tests])]
    for label, command in commands:
        result = runner(command, cwd=root, stdout=subprocess.PIPE, stderr=subprocess.STDOUT,
                        text=True, encoding='utf-8', errors='replace')
        print(result.stdout, flush=True)
        if result.returncode:
            detail = f'Falha nos testes {label}:\n' + result.stdout[-16000:]
            if os.environ.get('GITHUB_ACTIONS') == 'true':
                encoded = detail.replace('%', '%25').replace('\r', '%0D').replace('\n', '%0A')
                print('::error::' + encoded, flush=True)
            if summary := os.environ.get('GITHUB_STEP_SUMMARY'):
                with Path(summary).open('a', encoding='utf-8') as output:
                    output.write(f'### Falhas nos testes {label}\n\n```text\n{detail}\n```\n')
            return result.returncode
    return 0


if __name__ == '__main__':
    raise SystemExit(run_checks(Path(__file__).resolve().parents[2]))

"""A failed release check must block later phases and preserve the actual error."""
from contextlib import redirect_stdout
import importlib.util
import io
import os
from pathlib import Path
import subprocess
import tempfile
import unittest
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('release_checks', ROOT / 'desktop/scripts/run_release_checks.py')
checks = importlib.util.module_from_spec(spec)
spec.loader.exec_module(checks)


class ReleaseCheckDiagnosticsTests(unittest.TestCase):
    def test_browser_failure_stops_later_suites_and_identifies_actual_failure(self):
        calls = []
        def failed(command, **kwargs):
            calls.append(command)
            return subprocess.CompletedProcess(command, 9, 'TimeoutError: actual browser failure\n')
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            (root / 'tests/browser').mkdir(parents=True)
            for name in ['a', 'b']:
                (root / f'tests/browser/{name}.cjs').touch()
            output = io.StringIO()
            with patch.dict(os.environ, {'GITHUB_ACTIONS': 'true', 'GITHUB_STEP_SUMMARY': ''}), redirect_stdout(output):
                self.assertEqual(checks.run_browser_checks(root, failed), 9)
            self.assertEqual(len(calls), 1)
            self.assertIn('::error::Falha nos testes Browser a:', output.getvalue())
            self.assertIn('actual browser failure', output.getvalue())

    def test_missing_browser_suites_block_publication(self):
        with tempfile.TemporaryDirectory() as directory:
            with self.assertRaisesRegex(ValueError, 'Publicação bloqueada'):
                checks.run_browser_checks(Path(directory))

    def test_long_output_keeps_the_final_traceback_in_bounded_annotations(self):
        trace = 'ERROR: recovery\nTraceback: actual final failure\nFAILED (errors=1)\n'
        def failed(command, **kwargs):
            return subprocess.CompletedProcess(command, 1, 'noise\n' * 3000 + trace)
        with tempfile.TemporaryDirectory() as directory:
            output = io.StringIO()
            with patch.dict(os.environ, {'GITHUB_ACTIONS': 'true', 'GITHUB_STEP_SUMMARY': ''}), redirect_stdout(output):
                self.assertEqual(checks.run_checks(Path(directory), failed), 1)
            annotations = [line for line in output.getvalue().splitlines() if line.startswith('::error::')]
            self.assertGreater(len(annotations), 1)
            self.assertIn('actual final failure', annotations[-1])
            self.assertTrue(all(len(line) < 4096 for line in annotations))

    def test_python_failure_stops_before_node_and_exposes_escaped_error(self):
        calls = []
        def failed(command, **kwargs):
            calls.append(command)
            return subprocess.CompletedProcess(command, 1, 'FAIL: original error\nvalue 100%\r\n')
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            summary = root / 'summary.md'
            output = io.StringIO()
            with patch.dict(os.environ, {'GITHUB_ACTIONS': 'true', 'GITHUB_STEP_SUMMARY': str(summary)}), redirect_stdout(output):
                self.assertEqual(checks.run_checks(root, failed), 1)
            self.assertEqual(len(calls), 1)
            self.assertIn('FAIL: original error', summary.read_text(encoding='utf-8'))
            self.assertIn('::error::Falha nos testes Python:%0A', output.getvalue())
            self.assertIn('100%25%0D%0A', output.getvalue())

    def test_node_failure_after_successful_python_keeps_its_exit_code_and_details(self):
        calls = []
        def run(command, **kwargs):
            calls.append(command)
            return subprocess.CompletedProcess(command, 0 if len(calls) == 1 else 7, 'Node failure details')
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            (root / 'tests').mkdir()
            (root / 'tests/example.test.mjs').touch()
            output = io.StringIO()
            with patch.dict(os.environ, {'GITHUB_ACTIONS': 'true', 'GITHUB_STEP_SUMMARY': ''}), redirect_stdout(output):
                self.assertEqual(checks.run_checks(root, run), 7)
            self.assertEqual(len(calls), 2)
            self.assertIn('example.test.mjs', calls[1][-1])
            self.assertIn('::error::Falha nos testes JavaScript:', output.getvalue())
            self.assertIn('Node failure details', output.getvalue())

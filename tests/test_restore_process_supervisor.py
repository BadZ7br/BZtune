"""Compile and execute the production timeout supervisor's Rust tests."""
from pathlib import Path
import shutil
import subprocess
import tempfile
import unittest

ROOT=Path(__file__).resolve().parents[1]

class RestoreProcessSupervisorTests(unittest.TestCase):
    @unittest.skipUnless(shutil.which('rustc'), 'Rust toolchain required')
    def test_production_supervisor(self):
        with tempfile.TemporaryDirectory() as folder:
            exe=Path(folder)/'restore-process-tests.exe'
            compiled=subprocess.run(['rustc','--edition=2021','--test',str(ROOT/'desktop/src-tauri/src/restore_process.rs'),'-o',str(exe)],capture_output=True,text=True,timeout=60)
            self.assertEqual(compiled.returncode,0,compiled.stderr)
            result=subprocess.run([str(exe)],capture_output=True,text=True,timeout=15)
            self.assertEqual(result.returncode,0,result.stdout+result.stderr)

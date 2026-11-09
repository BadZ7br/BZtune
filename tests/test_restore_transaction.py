"""Real terminated workers and disposable libraries, no user files or providers."""
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest

ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/'doomvault-api'))
from services.restore_transaction import recover, library_lock, journal_path, install
from unittest.mock import patch

WORKER='''
import os,sys,time,json
from pathlib import Path
from services.restore_transaction import install,library_lock
root=Path(sys.argv[1]);phase=sys.argv[2];base=root/'library';staging=root/'bztune_restore_test';backup=root/'bztune-user-backups'/'doomvault_library_test'
original=os.replace
def replace(src,dst):
 original(src,dst)
 if ((phase=='old' and Path(dst)==backup) or (phase=='new' and Path(dst)==base)
     or (phase=='committed' and Path(dst).name=='.library.restore.json' and json.loads(Path(dst).read_text())['committed'])):
  print('paused',flush=True);time.sleep(60)
os.replace=replace
with library_lock(base):
 if phase=='locked':print('paused',flush=True);time.sleep(60)
 install(staging,base,backup)
'''

class RestoreTransactionTests(unittest.TestCase):
    def setUp(self):
        self.temp=tempfile.TemporaryDirectory();self.addCleanup(self.temp.cleanup)
        self.root=Path(self.temp.name).resolve();self.base=self.root/'library'
        self.staging=self.root/'bztune_restore_test'
        for folder,value in [(self.base,'old'),(self.staging,'new')]:
            folder.mkdir();(folder/'marker').write_text(value)
        (self.root/'bztune-user-backups').mkdir()

    def worker(self,phase,root=None):
        process=subprocess.Popen([sys.executable,'-u','-c',WORKER,str(root or self.root),phase],
            env={**os.environ,'PYTHONPATH':str(ROOT/'doomvault-api')},stdout=subprocess.PIPE,stderr=subprocess.PIPE,text=True)
        self.addCleanup(lambda: self.stop(process))
        self.assertEqual(process.stdout.readline().strip(),'paused')
        return process

    @staticmethod
    def stop(process):
        if process.poll() is None:process.kill()
        process.communicate(timeout=5)

    def test_hung_workers_roll_back_both_directory_swap_windows(self):
        for phase in ('old','new'):
            with self.subTest(phase=phase):
                process=self.worker(phase)
                with self.assertRaises(subprocess.TimeoutExpired):process.wait(timeout=.05)
                # Recovery cannot acquire the lock while this worker remains alive.
                with self.assertRaises(RuntimeError):
                    with library_lock(self.base,timeout=.05):pass
                self.stop(process)
                with library_lock(self.base):recover(self.base)
                self.assertEqual((self.base/'marker').read_text(),'old')
                self.assertFalse(journal_path(self.base).exists())
                # Reconstruct the staging directory for the second crash window.
                if not self.staging.exists():self.staging.mkdir();(self.staging/'marker').write_text('new')

    def test_commit_is_preserved_and_previous_library_remains_available(self):
        process=self.worker('committed');self.stop(process)
        with library_lock(self.base):recover(self.base)
        self.assertEqual((self.base/'marker').read_text(),'new')
        self.assertEqual((self.root/'bztune-user-backups/doomvault_library_test/marker').read_text(),'old')
        with library_lock(self.base):recover(self.base) # idempotent restart

    def test_startup_recovers_before_creating_a_missing_library_directory(self):
        process=self.worker('old');self.stop(process)
        self.assertFalse(self.base.exists())
        result=subprocess.run([sys.executable,'-c',
            "import sys;sys.path.insert(0,sys.argv[1]);from backend_entry import configure_library;configure_library()",
            str(ROOT/'desktop')], env={**os.environ,'PYTHONPATH':str(ROOT/'doomvault-api'),
            'BZTUNE_LIBRARY_DIR':str(self.base)},capture_output=True,text=True,timeout=10)
        self.assertEqual(result.returncode,0,result.stderr)
        self.assertEqual((self.base/'marker').read_text(),'old')

    def test_preparation_timeout_preserves_the_original_library(self):
        process=self.worker('locked');self.stop(process)
        with library_lock(self.base):recover(self.base)
        self.assertEqual((self.base/'marker').read_text(),'old')
        self.assertEqual((self.staging/'marker').read_text(),'new')

    def test_failed_rollback_keeps_journal_for_next_startup(self):
        backup=self.root/'bztune-user-backups/doomvault_library_test'
        original=os.replace
        def blocked(source,destination):
            if Path(destination)==self.base:
                raise OSError('synthetic Windows file lock')
            return original(source,destination)
        with library_lock(self.base), patch('services.restore_transaction.os.replace',side_effect=blocked):
            with self.assertRaises(OSError):install(self.staging,self.base,backup)
        self.assertTrue(journal_path(self.base).exists())
        self.assertEqual((backup/'marker').read_text(),'old')
        with library_lock(self.base):recover(self.base)
        self.assertEqual((self.base/'marker').read_text(),'old')

    def test_existing_previous_backup_is_never_overwritten(self):
        backup=self.root/'bztune-user-backups/doomvault_library_test'
        backup.mkdir();(backup/'marker').write_text('older')
        with library_lock(self.base):
            with self.assertRaises(FileExistsError):install(self.staging,self.base,backup)
        self.assertEqual((self.base/'marker').read_text(),'old')
        self.assertEqual((backup/'marker').read_text(),'older')
        self.assertFalse(journal_path(self.base).exists())

    def test_recovery_accepts_a_different_spelling_of_the_same_parent(self):
        if os.name == 'nt':
            import ctypes
            buffer=ctypes.create_unicode_buffer(32768)
            length=ctypes.windll.kernel32.GetShortPathNameW(str(self.root),buffer,len(buffer))
            self.assertGreater(length,0)
            alias=Path(buffer.value)
        else:
            alias=self.root/'parent-alias'
            alias.symlink_to(self.root,target_is_directory=True)
        process=self.worker('old',root=alias);self.stop(process)
        with library_lock(self.base):recover(self.base)
        self.assertEqual((self.base/'marker').read_text(),'old')

    def test_invalid_journal_never_moves_library(self):
        journal_path(self.base).write_text(json.dumps(dict(base=str(self.base),staging='/elsewhere',backup='/elsewhere',old=True,committed=False)))
        with self.assertRaises(ValueError):
            with library_lock(self.base):recover(self.base)
        self.assertEqual((self.base/'marker').read_text(),'old')
        self.assertTrue(journal_path(self.base).exists())

"""Configuration must never silently fall back when a signing identity is supplied."""
import importlib.util
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

spec=importlib.util.spec_from_file_location('android_signing',Path(__file__).resolve().parents[1]/'mobile/scripts/android_signing.py')
signing=importlib.util.module_from_spec(spec);spec.loader.exec_module(signing)

class AndroidSigningTests(unittest.TestCase):
    def test_no_identity_is_explicitly_disposable(self):
        with tempfile.TemporaryDirectory() as tmp:
            target=Path(tmp)/'key.jks'
            self.assertIsNone(signing.prepare(target,{}));self.assertFalse(target.exists())
    def test_partial_identity_is_rejected(self):
        with tempfile.TemporaryDirectory() as tmp:
            with self.assertRaises(ValueError):signing.prepare(Path(tmp)/'key.jks',{'BZTUNE_ANDROID_STORE_PASSWORD':'fixture'})
    def test_invalid_base64_never_writes_file(self):
        with tempfile.TemporaryDirectory() as tmp:
            target=Path(tmp)/'key.jks'
            with self.assertRaises(ValueError):signing.prepare(target,{'BZTUNE_ANDROID_STORE_PASSWORD':'fixture','BZTUNE_ANDROID_KEYSTORE_BASE64':'!!','BZTUNE_ANDROID_CERT_SHA256':'a'*64})
            self.assertFalse(target.exists())
    def test_wrong_certificate_removes_staged_secret(self):
        import base64
        with tempfile.TemporaryDirectory() as tmp:
            target=Path(tmp)/'key.jks'
            env={'BZTUNE_ANDROID_STORE_PASSWORD':'fixture','BZTUNE_ANDROID_KEYSTORE_BASE64':base64.b64encode(b'x'*200).decode(),'BZTUNE_ANDROID_CERT_SHA256':'a'*64}
            with patch.object(signing,'certificate',return_value='b'*64):
                with self.assertRaises(ValueError):signing.prepare(target,env)
            self.assertFalse(target.exists())
    def test_apk_must_match_one_expected_signer(self):
        import subprocess
        with patch.object(signing.subprocess,'run',return_value=subprocess.CompletedProcess([],0,'Signer #1 certificate SHA-256 digest: '+'b'*64,'')):
            with self.assertRaises(ValueError):signing.verify_apk(Path('fixture.apk'),'a'*64)
            self.assertEqual(signing.verify_apk(Path('fixture.apk'),'b'*64),'b'*64)

    def test_current_build_tools_certificate_format(self):
        import subprocess
        output='V3.0 Signer: certificate SHA-256 digest: '+'b'*64+'\n'
        with patch.object(signing.subprocess,'run',return_value=subprocess.CompletedProcess([],0,output,'')):
            self.assertEqual(signing.verify_apk(Path('fixture.apk'),'b'*64),'b'*64)
        with patch.object(signing.subprocess,'run',return_value=subprocess.CompletedProcess([],0,output+'Signer #2 certificate SHA-256 digest: '+'a'*64,'')):
            with self.assertRaises(ValueError):signing.verify_apk(Path('fixture.apk'),'b'*64)

    def test_bootstrap_rejects_non_github_execution_and_existing_identity(self):
        import importlib.util
        import sys
        with patch.dict(sys.modules,{'android_signing':signing}):
            spec=importlib.util.spec_from_file_location('bootstrap',Path(__file__).resolve().parents[1]/'mobile/scripts/bootstrap_preview_signing.py')
            bootstrap=importlib.util.module_from_spec(spec);spec.loader.exec_module(bootstrap)
        with self.assertRaises(RuntimeError):bootstrap.provision({})
        env={'GITHUB_ACTIONS':'true','GITHUB_EVENT_NAME':'workflow_dispatch','GITHUB_REF':'refs/heads/main','GITHUB_REPOSITORY':'BadZ7br/BZtune','GH_TOKEN':'fixture'}
        with patch.object(bootstrap,'gh',side_effect=['[{"name":"ANDROID_PREVIEW_KEYSTORE_PASSWORD"}]','[]']) as api:
            with self.assertRaises(RuntimeError):bootstrap.provision(env)
            self.assertEqual(api.call_count,2,'must only read, never overwrite an existing identity')

    def test_bootstrap_keeps_private_values_on_stdin_and_out_of_logs(self):
        import contextlib
        import importlib.util
        import io
        import subprocess
        import sys
        with patch.dict(sys.modules,{'android_signing':signing}):
            spec=importlib.util.spec_from_file_location('bootstrap_fixture',Path(__file__).resolve().parents[1]/'mobile/scripts/bootstrap_preview_signing.py')
            bootstrap=importlib.util.module_from_spec(spec);spec.loader.exec_module(bootstrap)
        env={'GITHUB_ACTIONS':'true','GITHUB_EVENT_NAME':'workflow_dispatch','GITHUB_REF':'refs/heads/main','GITHUB_REPOSITORY':'BadZ7br/BZtune','GH_TOKEN':'fixture'}
        calls=[]
        def api(arguments,environment,value=None):
            calls.append((arguments,value))
            return '[]' if arguments[1]=='list' else ''
        def keytool(arguments,**kwargs):
            Path(arguments[arguments.index('-keystore')+1]).write_bytes(b'private fixture keystore')
            return subprocess.CompletedProcess(arguments,0,b'',b'')
        output=io.StringIO()
        with patch.object(bootstrap,'gh',side_effect=api),patch.object(bootstrap.subprocess,'run',side_effect=keytool),patch.object(bootstrap,'certificate',return_value='a'*64),contextlib.redirect_stdout(output):
            bootstrap.provision(env)
        writes=[(args,value) for args,value in calls if args[:2]==['secret','set']]
        self.assertEqual(len(writes),2)
        for args,value in writes:
            self.assertTrue(value)
            self.assertNotIn(value,output.getvalue())
            self.assertNotIn(value,args)
        self.assertEqual(calls[-1][0][:3],['secret','delete','ANDROID_SIGNING_SETUP_TOKEN'])

    def load_bootstrap(self):
        import importlib.util
        import sys
        with patch.dict(sys.modules,{'android_signing':signing}):
            spec=importlib.util.spec_from_file_location('bootstrap_diagnostics',Path(__file__).resolve().parents[1]/'mobile/scripts/bootstrap_preview_signing.py')
            module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)
        return module

    def test_missing_setup_secret_has_specific_public_diagnostic(self):
        import contextlib
        import io
        module=self.load_bootstrap();output=io.StringIO()
        env={'GITHUB_ACTIONS':'true','GITHUB_EVENT_NAME':'workflow_dispatch','GITHUB_REF':'refs/heads/main','GITHUB_REPOSITORY':'BadZ7br/BZtune'}
        with patch.object(module,'gh') as api,contextlib.redirect_stdout(output):
            self.assertEqual(module.main(env),1)
        self.assertIn('[TOKEN_AUSENTE]',output.getvalue());api.assert_not_called()

    def test_api_diagnostics_never_echo_raw_output(self):
        import subprocess
        module=self.load_bootstrap()
        for args,stderr,expected in [
            (['secret','list'],'HTTP 401 Bad credentials PRIVATE_FIXTURE','TOKEN_INVALIDO'),
            (['secret','list'],'HTTP 403 PRIVATE_FIXTURE','PERMISSAO_SECRETS'),
            (['variable','list'],'Resource not accessible PRIVATE_FIXTURE','PERMISSAO_VARIABLES'),
            (['secret','set'],'HTTP 404 PRIVATE_FIXTURE','ACESSO_REPOSITORIO'),
            (['variable','set'],'unexpected PRIVATE_FIXTURE','API_VARIABLES')]:
            with self.subTest(expected=expected),patch.object(module.subprocess,'run',return_value=subprocess.CompletedProcess([],1,'PRIVATE_FIXTURE',stderr)):
                with self.assertRaises(module.SetupError) as caught:module.gh(args,{'GH_TOKEN':'PRIVATE_FIXTURE'})
                self.assertIn(expected,str(caught.exception));self.assertNotIn('PRIVATE_FIXTURE',str(caught.exception))

    def test_existing_identity_is_reported_without_generating_a_key(self):
        import contextlib
        import io
        module=self.load_bootstrap();output=io.StringIO()
        env={'GITHUB_ACTIONS':'true','GITHUB_EVENT_NAME':'workflow_dispatch','GITHUB_REF':'refs/heads/main','GITHUB_REPOSITORY':'badz7br/bztune','GH_TOKEN':'fixture'}
        with patch.object(module,'gh',side_effect=['[]','[{"name":"ANDROID_PREVIEW_CERT_SHA256"}]']) as api,contextlib.redirect_stdout(output):
            self.assertEqual(module.main(env),1)
        self.assertIn('[IDENTIDADE_EXISTENTE]',output.getvalue());self.assertEqual(api.call_count,2)

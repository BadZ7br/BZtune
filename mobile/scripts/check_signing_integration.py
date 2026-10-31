"""Verify signing end to end using a disposable fixture key and a copy of an APK."""
import argparse
import base64
import os
from pathlib import Path
import subprocess
import tempfile
from android_signing import ALIAS,certificate,prepare,verify_apk

parser=argparse.ArgumentParser();parser.add_argument('apk',type=Path);parser.add_argument('--apksigner',default='apksigner');args=parser.parse_args()
with tempfile.TemporaryDirectory(prefix='bztune-signing-fixture-') as tmp:
    root=Path(tmp);key=root/'fixture.jks'
    env=dict(os.environ);env['BZTUNE_ANDROID_STORE_PASSWORD']='disposable-fixture-password'
    generated=subprocess.run(['keytool','-genkeypair','-alias',ALIAS,'-keyalg','RSA','-keysize','2048','-validity','2','-dname','CN=Disposable Test Fixture','-storetype','JKS','-keystore',str(key),'-storepass:env','BZTUNE_ANDROID_STORE_PASSWORD','-keypass:env','BZTUNE_ANDROID_STORE_PASSWORD','-noprompt'],env=env,stdout=subprocess.PIPE,stderr=subprocess.PIPE)
    if generated.returncode:raise SystemExit('Falha ao gerar a chave temporária de teste.')
    cert=certificate(key,env)
    env.update(BZTUNE_ANDROID_CERT_SHA256=cert,BZTUNE_ANDROID_KEYSTORE_BASE64=base64.b64encode(key.read_bytes()).decode())
    prepared=root/'prepared.jks';assert prepare(prepared,env)==cert
    signed=root/'signed.apk'
    result=subprocess.run([args.apksigner,'sign','--ks',str(prepared),'--ks-key-alias',ALIAS,'--ks-pass','env:BZTUNE_ANDROID_STORE_PASSWORD','--key-pass','env:BZTUNE_ANDROID_STORE_PASSWORD','--out',str(signed),str(args.apk)],env=env,stdout=subprocess.PIPE,stderr=subprocess.PIPE)
    if result.returncode:raise SystemExit('Falha ao assinar a cópia temporária do APK.')
    assert verify_apk(signed,cert,args.apksigner)==cert
    try:verify_apk(signed,'0'*64,args.apksigner)
    except ValueError:pass
    else:raise AssertionError('Certificado incorreto aceito')
print('PASS real keystore preparation, APK signing and certificate pinning; temporary private files removed')

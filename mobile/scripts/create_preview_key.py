"""Run on the owner's computer. Generates private files; never uploads or prints credentials."""
import argparse
import base64
import getpass
import os
from pathlib import Path
import subprocess
from android_signing import ALIAS, certificate

if __name__ == '__main__':
    parser=argparse.ArgumentParser(description='Criar chave fixa de teste Android fora do repositório.')
    parser.add_argument('--output',type=Path,required=True)
    args=parser.parse_args()
    root=Path(__file__).resolve().parents[2]
    destination=args.output.resolve()
    if destination.is_relative_to(root):
        raise SystemExit('Escolha uma pasta privada fora do repositório.')
    if destination.exists():
        raise SystemExit('A pasta já existe; escolha uma nova. Nenhuma chave será sobrescrita.')
    password=getpass.getpass('Senha nova para a chave (mínimo 12 caracteres): ')
    if len(password)<12 or password!=getpass.getpass('Repita a senha: '):
        raise SystemExit('Senhas diferentes ou curtas.')
    destination.mkdir(parents=True,mode=0o700)
    keystore=destination/'bztune-preview.jks'
    env=dict(os.environ);env['BZTUNE_ANDROID_STORE_PASSWORD']=password
    result=subprocess.run(['keytool','-genkeypair','-alias',ALIAS,'-keyalg','RSA','-keysize','3072',
        '-sigalg','SHA256withRSA','-validity','36500','-dname','CN=BZtune Android Preview',
        '-storetype','JKS','-keystore',str(keystore),'-storepass:env','BZTUNE_ANDROID_STORE_PASSWORD',
        '-keypass:env','BZTUNE_ANDROID_STORE_PASSWORD','-noprompt'],env=env,stdout=subprocess.PIPE,stderr=subprocess.PIPE)
    if result.returncode:
        raise SystemExit('Falha ao gerar chave. Verifique se o JDK/keytool está instalado; não publique os arquivos privados.')
    os.chmod(keystore,0o600)
    encoded=destination/'keystore-base64.private.txt'
    with encoded.open('xb') as file:
        os.chmod(encoded,0o600);file.write(base64.b64encode(keystore.read_bytes()))
    actual=certificate(keystore,env)
    (destination/'certificate-sha256.public.txt').write_text(actual+'\n')
    print('Chave criada. Faça backup seguro desta pasta: '+str(destination))
    print('GitHub secret ANDROID_PREVIEW_KEYSTORE_BASE64: conteúdo de '+encoded.name)
    print('GitHub secret ANDROID_PREVIEW_KEYSTORE_PASSWORD: a senha escolhida (não gravada em arquivo).')
    print('GitHub variable ANDROID_PREVIEW_CERT_SHA256: '+actual)
    print('Não envie a chave, o Base64 ou a senha pelo chat, commits ou artefatos públicos.')

"""Owner-triggered GitHub-only provisioning. Never overwrites an existing signing identity."""
import base64
import json
import os
from pathlib import Path
import secrets
import subprocess
import tempfile
from android_signing import ALIAS, certificate

SECRET_NAMES={'ANDROID_PREVIEW_KEYSTORE_BASE64','ANDROID_PREVIEW_KEYSTORE_PASSWORD'}
VARIABLE='ANDROID_PREVIEW_CERT_SHA256'


def gh(arguments, env, value=None):
    result=subprocess.run(['gh',*arguments],input=value,text=True,env=env,stdout=subprocess.PIPE,stderr=subprocess.PIPE)
    if result.returncode:
        raise RuntimeError('O GitHub recusou a operação. Confira as permissões do token; não copie seu valor para logs ou chat.')
    return result.stdout


def provision(env):
    if env.get('GITHUB_ACTIONS')!='true' or env.get('GITHUB_EVENT_NAME')!='workflow_dispatch' or env.get('GITHUB_REF')!='refs/heads/main':
        raise RuntimeError('Execute somente pelo workflow manual no main.')
    if env.get('GITHUB_REPOSITORY')!='BadZ7br/BZtune' or not env.get('GH_TOKEN'):
        raise RuntimeError('Repositório/token de configuração inválido.')
    repo=env['GITHUB_REPOSITORY']
    names={row['name'] for row in json.loads(gh(['secret','list','--repo',repo,'--json','name'],env))}
    variables={row['name'] for row in json.loads(gh(['variable','list','--repo',repo,'--json','name'],env))}
    if names & SECRET_NAMES or VARIABLE in variables:
        raise RuntimeError('Já existe configuração de assinatura (mesmo parcial). Nada foi sobrescrito. Não gere outra chave para um APK já distribuído.')
    password=secrets.token_urlsafe(36)
    child=dict(env);child['BZTUNE_ANDROID_STORE_PASSWORD']=password
    with tempfile.TemporaryDirectory(prefix='bztune-private-preview-') as tmp:
        key=Path(tmp)/'preview.jks'
        result=subprocess.run(['keytool','-genkeypair','-alias',ALIAS,'-keyalg','RSA','-keysize','3072','-sigalg','SHA256withRSA',
            '-validity','36500','-dname','CN=BZtune Android Preview','-storetype','JKS','-keystore',str(key),
            '-storepass:env','BZTUNE_ANDROID_STORE_PASSWORD','-keypass:env','BZTUNE_ANDROID_STORE_PASSWORD','-noprompt'],
            env=child,stdout=subprocess.PIPE,stderr=subprocess.PIPE)
        if result.returncode:raise RuntimeError('Falha ao gerar o keystore. Nenhum arquivo privado foi publicado.')
        os.chmod(key,0o600)
        cert=certificate(key,child)
        encoded=base64.b64encode(key.read_bytes()).decode()
        # stdin keeps values out of shell arguments and command logs.
        gh(['secret','set','ANDROID_PREVIEW_KEYSTORE_BASE64','--repo',repo],env,encoded)
        gh(['secret','set','ANDROID_PREVIEW_KEYSTORE_PASSWORD','--repo',repo],env,password)
        gh(['variable','set',VARIABLE,'--repo',repo,'--body',cert],env)
    # The bootstrap credential is not needed by any future Android build.
    try:
        gh(['secret','delete','ANDROID_SIGNING_SETUP_TOKEN','--repo',repo],env)
    except RuntimeError:
        print('Identidade criada; remova manualmente o secret ANDROID_SIGNING_SETUP_TOKEN e revogue o token na sua conta.')
    print('Identidade Android criada. Certificado público SHA-256: '+cert)
    if summary:=env.get('GITHUB_STEP_SUMMARY'):
        with open(summary,'a',encoding='utf8') as file:
            file.write('## Assinatura Android preparada\n\nSHA-256 público: `'+cert+'`\n\nChave e senha guardadas em repository secrets. O token de configuração foi removido dos secrets; revogue também o token na sua conta GitHub. Execute o workflow Android de teste no main para verificar o APK.\n')


if __name__=='__main__':
    try:provision(dict(os.environ))
    except (RuntimeError,ValueError):
        raise SystemExit('Configuração não concluída. Confira token/permissões e se já há valores de assinatura; nenhum secret existente foi sobrescrito. Em configuração parcial, peça orientação antes de apagar qualquer identidade já usada.') from None

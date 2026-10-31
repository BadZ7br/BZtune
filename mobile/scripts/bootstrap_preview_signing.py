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


class SetupError(RuntimeError):
    """Messages contain only controlled text, never raw CLI output or input values."""



def gh(arguments, env, value=None):
    result=subprocess.run(['gh',*arguments],input=value,text=True,env=env,stdout=subprocess.PIPE,stderr=subprocess.PIPE)
    if result.returncode:
        # Inspect locally but never print gh stderr: it may contain credential material.
        detail=(result.stderr or '').lower()
        area='Secrets' if arguments[0]=='secret' else 'Variables'
        operation='ler' if arguments[1]=='list' else 'gravar' if arguments[1]=='set' else 'remover'
        if '401' in detail or 'bad credentials' in detail or 'invalid token' in detail:
            raise SetupError('[TOKEN_INVALIDO] O token foi recusado ou expirou. Atualize somente ANDROID_SIGNING_SETUP_TOKEN.')
        if '403' in detail or 'resource not accessible' in detail:
            raise SetupError(f'[PERMISSAO_{area.upper()}] O token não pode {operation} {area}. Confira Read and write e acesso ao repositório BZtune.')
        if '404' in detail or 'not found' in detail:
            raise SetupError(f'[ACESSO_REPOSITORIO] O GitHub não permitiu {operation} {area}. Confira se o token seleciona BZtune e se está aprovado.')
        raise SetupError(f'[API_{area.upper()}] Não foi possível {operation} {area}. Confira as permissões do token; nenhum valor privado é exibido.')
    return result.stdout


def provision(env):
    if env.get('GITHUB_ACTIONS')!='true' or env.get('GITHUB_EVENT_NAME')!='workflow_dispatch' or env.get('GITHUB_REF')!='refs/heads/main':
        raise SetupError('[ORIGEM_INVALIDA] Execute Run workflow no branch main.')
    if env.get('GITHUB_REPOSITORY','').casefold()!='badz7br/bztune':
        raise SetupError('[REPOSITORIO_INVALIDO] Execute no repositório BadZ7br/BZtune.')
    if not env.get('GH_TOKEN','').strip():
        raise SetupError('[TOKEN_AUSENTE] Não foi encontrado o repository secret ANDROID_SIGNING_SETUP_TOKEN. Confira o nome exato e cadastre em Secrets, não em Variables.')
    repo=env['GITHUB_REPOSITORY']
    names={row['name'] for row in json.loads(gh(['secret','list','--repo',repo,'--json','name'],env))}
    variables={row['name'] for row in json.loads(gh(['variable','list','--repo',repo,'--json','name'],env))}
    if names & SECRET_NAMES or VARIABLE in variables:
        present=(names & SECRET_NAMES) | ({VARIABLE} if VARIABLE in variables else set())
        missing=(SECRET_NAMES | {VARIABLE}) - present
        if not missing:
            raise SetupError('[IDENTIDADE_EXISTENTE] Os dois secrets e o SHA-256 já existem. Nada foi sobrescrito. Execute Android - APK de teste para conferir a assinatura.')
        raise SetupError('[IDENTIDADE_EXISTENTE] Configuração parcial; faltam: '+', '.join(sorted(missing))+'. Nada foi sobrescrito. Não apague uma identidade já usada.')
    password=secrets.token_urlsafe(36)
    child=dict(env);child['BZTUNE_ANDROID_STORE_PASSWORD']=password
    with tempfile.TemporaryDirectory(prefix='bztune-private-preview-') as tmp:
        key=Path(tmp)/'preview.jks'
        result=subprocess.run(['keytool','-genkeypair','-alias',ALIAS,'-keyalg','RSA','-keysize','3072','-sigalg','SHA256withRSA',
            '-validity','36500','-dname','CN=BZtune Android Preview','-storetype','JKS','-keystore',str(key),
            '-storepass:env','BZTUNE_ANDROID_STORE_PASSWORD','-keypass:env','BZTUNE_ANDROID_STORE_PASSWORD','-noprompt'],
            env=child,stdout=subprocess.PIPE,stderr=subprocess.PIPE)
        if result.returncode:raise SetupError('[GERACAO_CHAVE] Falha ao gerar o keystore com keytool. Nenhum arquivo privado foi publicado.')
        os.chmod(key,0o600)
        try:
            cert=certificate(key,child)
        except ValueError:
            raise SetupError('[CONFERENCIA_CERTIFICADO] A chave foi gerada, mas não foi possível conferir o certificado. Nenhum material privado foi publicado.') from None
        encoded=base64.b64encode(key.read_bytes()).decode()
        # stdin keeps values out of shell arguments and command logs.
        gh(['secret','set','ANDROID_PREVIEW_KEYSTORE_BASE64','--repo',repo],env,encoded)
        gh(['secret','set','ANDROID_PREVIEW_KEYSTORE_PASSWORD','--repo',repo],env,password)
        gh(['variable','set',VARIABLE,'--repo',repo,'--body',cert],env)
    # The bootstrap credential is not needed by any future Android build.
    token_removed=True
    try:
        gh(['secret','delete','ANDROID_SIGNING_SETUP_TOKEN','--repo',repo],env)
    except RuntimeError:
        token_removed=False
        print('Identidade criada; remova manualmente o secret ANDROID_SIGNING_SETUP_TOKEN e revogue o token na sua conta.')
    print('Identidade Android criada. Certificado público SHA-256: '+cert)
    cleanup='O token de configuração foi removido dos secrets' if token_removed else 'Remova manualmente o secret ANDROID_SIGNING_SETUP_TOKEN'
    if summary:=env.get('GITHUB_STEP_SUMMARY'):
        with open(summary,'a',encoding='utf8') as file:
            file.write('## Assinatura Android preparada\n\nSHA-256 público: `'+cert+'`\n\nChave e senha guardadas em repository secrets. '+cleanup+'; revogue também o token na sua conta GitHub. Execute o workflow Android de teste no main para verificar o APK.\n')


def main(env):
    try:
        provision(env)
        return 0
    except SetupError as error:
        message=str(error)
    except (RuntimeError, ValueError, KeyError, TypeError):
        message='[RESPOSTA_INVALIDA] Configuração não concluída. Confira os valores existentes; nenhuma chave existente foi sobrescrita.'
    print('::error::'+message)
    if summary:=env.get('GITHUB_STEP_SUMMARY'):
        with open(summary,'a',encoding='utf8') as file:
            file.write('## Configuração de assinatura não concluída\n\n'+message+'\n\nNão envie token, senha ou keystore ao chat.\n')
    return 1


if __name__=='__main__':
    raise SystemExit(main(dict(os.environ)))

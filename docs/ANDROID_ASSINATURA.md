# Assinatura estável dos APKs de teste

O build Android usa o mesmo pacote `com.bztune.android.preview`. Com a mesma chave e
versionCode adequado, as próximas versões podem atualizar a instalação preservando
seus dados. A chave do atualizador Windows não serve para assinar APK Android.

## Situação e transição

Os APKs 0.1–0.3 já distribuídos foram assinados por chaves debug descartáveis do runner.
Não existe garantia de atualização sobre esses APKs. A primeira instalação com uma
chave nova pode exigir reinstalação: catálogo e fila privados do APK antigo não são
preservados ao desinstalar. Os arquivos de música originais continuam no armazenamento.
Não prometa migrar a chave debug antiga: ela não foi guardada pelo workflow anterior.

Antes de acumular playlists/dados importantes, configure a identidade estável abaixo.
O backup novo também não pode exportar dados de uma instalação antiga que ainda não
possui essa função. Se for necessário reinstalar, reimporte os originais e conceda o
acesso novamente pelo seletor Android. Não desinstale contando com backup automático.

## Configurar pelo celular (sem computador)

O workflow **Android - Configurar chave estável** gera a chave dentro do runner e
cadastra os dois secrets e a variável automaticamente. Ele não publica chave/senha
em logs ou artefatos e recusa substituir qualquer configuração de assinatura existente.

1. No navegador do celular, crie um [fine-grained personal access token](https://github.com/settings/personal-access-tokens/new).
   Selecione somente o repositório `BadZ7br/BZtune`, expiração curta (por exemplo, um dia),
   e as permissões de repositório **Secrets: Read and write** e **Variables: Read and write**.
   Metadata de leitura é automática. Não é necessário dar permissão de escrita no código.
2. Em [Repository secrets](https://github.com/BadZ7br/BZtune/settings/secrets/actions),
   crie `ANDROID_SIGNING_SETUP_TOKEN` com esse token. Não envie o token no chat.
3. Em Actions, abra **Android - Configurar chave estável → Run workflow**, branch `main`.
   O workflow gera a identidade, guarda os valores e remove o secret de configuração
   quando a operação termina. Depois, revogue também o token na sua conta GitHub.
4. Execute **Android - APK de teste** no `main`. O artefato deve indicar assinatura
   estável e o certificado do APK deve corresponder ao SHA-256 registrado.

Se o fluxo falhar após cadastrar parte dos valores, não faça tentativas de sobrescrever
uma chave já usada. Confira os nomes dos dois secrets e da variável. Somente se nunca
houve APK distribuído com essa identidade, uma configuração parcial pode ser removida
pelo proprietário para começar novamente. Peça orientação se houver dúvida.

A identidade fica guardada nos secrets do GitHub; este bootstrap não fornece uma cópia
privada fora do GitHub. Antes de produção, planeje backup privado recuperável da chave.
O token temporário serve só ao bootstrap e nunca deve ser necessário para os builds normais.


## Preparar a chave no computador do proprietário

Requisitos: Python 3.12 e JDK 21 com `keytool` no PATH. A partir do repositório:

```sh
python mobile/scripts/create_preview_key.py --output ../bztune-android-private
```

O programa pede a senha sem exibi-la, recusa sobrescrever uma pasta existente e cria:

- `bztune-preview.jks`: chave privada criptografada, alias `bztune-preview`.
- `keystore-base64.private.txt`: conteúdo privado para o secret GitHub.
- `certificate-sha256.public.txt`: identidade pública do certificado.

Guarde uma cópia segura da pasta e da senha fora do repositório. Não envie esses
arquivos privados pelo chat, commits, issues ou artefatos de Actions. O SHA-256 público
pode ser compartilhado. Perder a chave pode impedir futuras atualizações desse pacote.

## Configurar o GitHub

Abra [Settings → Secrets and variables → Actions](https://github.com/BadZ7br/BZtune/settings/secrets/actions).
Cadastre como **Repository secrets**:

| Nome | Valor |
| --- | --- |
| `ANDROID_PREVIEW_KEYSTORE_BASE64` | Conteúdo completo de `keystore-base64.private.txt` |
| `ANDROID_PREVIEW_KEYSTORE_PASSWORD` | Senha escolhida ao gerar a chave |

Na aba **Variables**, cadastre a **Repository variable**:

| Nome | Valor |
| --- | --- |
| `ANDROID_PREVIEW_CERT_SHA256` | Conteúdo de `certificate-sha256.public.txt` |

Execute **Android - APK de teste → Run workflow** no branch main. A configuração fica
no GitHub; não é necessário fornecer os valores ao assistente.

## Comportamento do workflow

- Sem os três valores: gera debug descartável, com esse nome no artefato; não afirma estabilidade.
- Configuração parcial/incorreta: bloqueia a geração, sem fallback debug silencioso.
- Configuração válida: cria o keystore só no diretório temporário, confere o certificado,
  assina via Gradle e verifica novamente o certificado do APK final.
- O artefato estável se chama `BZtune-Android-7-teste-assinatura-estavel`.
- O keystore é removido ao terminar. Senhas não são passadas na linha de comando ou
  gravadas em arquivos do repositório; o build assinado desativa o cache de configuração Gradle; secrets não são usados nos builds de pull request.

O app continua sendo de desenvolvimento, mesmo com chave fixa. Isso não é publicação
na Play Store nem uma assinatura de produção definitiva. Não troque a chave ou o pacote
nas próximas versões sem planejar a migração.

## Verificação

`tests/test_android_signing.py` cobre ausência/configuração parcial, Base64 inválido e
certificados divergentes. `mobile/scripts/check_signing_integration.py` gera uma chave
temporária, prepara o keystore, assina uma cópia do APK e verifica a identidade real.
Esse teste elimina seus materiais privados ao terminar; sua chave não é a definitiva.

Ativação real no GitHub depende dos secrets/variable acima. A API disponível ao
assistente retorna Forbidden e não permite cadastrar esses valores por aqui.


Validação local da preparação: oito testes Python aprovados; chave temporária gerada
com keytool, preparação, assinatura real de uma cópia do APK e conferência do certificado
aprovadas. Gradle signingReport selecionou stablePreview e o certificado configurado.
Esses testes não ativam uma chave definitiva. A chave temporária dos testes foi eliminada.


## Se o bootstrap falhar

A execução atual emite um código seguro no Summary/Annotations: TOKEN_AUSENTE,
TOKEN_INVALIDO, PERMISSAO_SECRETS, PERMISSAO_VARIABLES, ACESSO_REPOSITORIO ou
IDENTIDADE_EXISTENTE, além de falhas de geração/conferência de certificado.
A saída bruta do gh não é publicada. Não apague os valores de assinatura para testar.
Após atualizar o código, abra a página do workflow e use **Run workflow → main**:
reexecutar um run antigo pode usar o script anterior, sem esses diagnósticos.

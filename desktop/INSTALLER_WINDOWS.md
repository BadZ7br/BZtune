# Instalação guiada no Windows — BZtune Desktop

O instalador **NSIS** (arquivo `*-setup.exe`) inclui a interface do programa, o backend Flask compilado com PyInstaller, FFmpeg e FFprobe.

## Etapas para o usuário

1. **Análise de requisitos:** página informativa personalizada; consulta as chaves oficiais de registro do Microsoft WebView2 Runtime e mostra se ele já está instalado.
2. **Boas-vindas:** assistente padrão NSIS.
3. **Pasta de destino:** instalador por usuário, normalmente em `%LOCALAPPDATA%\BZtune`, sem exigir privilégio de administrador.
4. **Menu Iniciar:** opção de escolher os atalhos do programa.
5. **Instalação:** Tauri confere WebView2 novamente. Se já existir, evita reinstalá-lo. Se estiver ausente, usa o **bootstrapper oficial da Microsoft**, incluído no instalador, que baixa o runtime pela internet. Também copia todos os arquivos da aplicação.
6. **Verificação:** valida a presença do `bztune-backend.exe`, `bin\ffmpeg.exe` e `bin\ffprobe.exe`.
7. **Conclusão:** oferece abrir o BZtune.

### Dependências: o que é baixado e o que é incluído

| Componente | Procedimento no PC de destino |
| --- | --- |
| BZtune / Tauri / React | Incluído no setup |
| Python + Flask e outras bibliotecas Python | Empacotadas no executável `bztune-backend.exe`; não instala Python global |
| FFmpeg e FFprobe | Incluídos na pasta `bin` do programa |
| Node.js e Rust | Não necessários para executar o aplicativo |
| WebView2 Runtime | Verificado no Registro; caso ausente, o setup usa o bootstrapper Microsoft embutido para baixar e instalar o runtime |

**Internet é necessária no primeiro setup quando WebView2 não estiver instalado.** O modo `offlineInstaller` do Tauri pode ser utilizado futuramente para criar um instalador maior que também não dependa de rede.

### Segurança e atualização

- O instalador não executa scripts PowerShell na máquina do usuário, nem instala dependências Python/Node no sistema.
- O assistente de requisitos é ignorado em modos de atualização automática, silencioso (`/S`) e passivo (`/P`), para não interromper o Tauri Updater.
- A biblioteca do usuário fica separada, em `%LOCALAPPDATA%\BZtune\library`. O assistente de requisitos **não** altera esse diretório.
- Não remover o backup antes de testar uma instalação e uma atualização entre duas versões.
- A prévia experimental não habilita instalação automática de atualizações assinadas até a configuração das chaves.

## Checklist para validação em Windows

- [ ] Instalação em Windows x64 com WebView2 presente: a página informa a versão e o setup não baixa novamente.
- [ ] Instalação em ambiente de teste sem WebView2: a página avisa sobre a dependência, o bootstrapper instala o runtime e o BZtune abre.
- [ ] Instalação sem internet com WebView2 já presente: é possível concluir.
- [ ] Sem internet e sem WebView2: erro claro, sem instalar um aplicativo inutilizável.
- [ ] Pasta e atalhos aparecem no assistente em português.
- [ ] Backend, FFmpeg e FFprobe são instalados; o programa abre, consulta a API, reproduz áudio e encerra os subprocessos ao fechar.
- [ ] Reinstalação preserva a biblioteca local, os downloads e as playlists.
- [ ] Após configurar a assinatura, uma atualização Tauri `/UPDATE` funciona sem exibir a página de requisitos.
- [ ] O instalador e o backend não ficam rodando após o encerramento normal do BZtune.

**A compilação de CI não substitui os testes de instalação reais.**

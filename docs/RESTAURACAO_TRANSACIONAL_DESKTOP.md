# Recuperação de restauração interrompida — desktop

Implementação na branch `codex/desktop-maintenance-2026-11-08`. Sem atualização pública nesta etapa.

## Fluxo

1. Congelar o ZIP aprovado e verificar seu SHA-256, como antes.
2. Adquirir lock de biblioteca entre processos; validar ZIP, hashes, espaço e SQLite; extrair em staging. A biblioteca atual permanece intacta nesta preparação.
3. Gravar e sincronizar um journal externo à biblioteca antes de qualquer rename. Guardar caminho esperado, staging, backup anterior e estado confirmado.
4. Mover a biblioteca anterior para backup e instalar o staging por rename.
5. Confirmar a transação por substituição atômica do journal; manter o backup anterior.
6. Na inicialização do sidecar, recuperar uma transação pendente **antes de criar a pasta da biblioteca e iniciar a API**.

Journal: `.<nome-da-biblioteca>.restore.json`; lock: `.<nome-da-biblioteca>.restore.lock`, ambos na pasta pai. O lock é mantido pelo sistema operacional e liberado ao terminar o processo, inclusive encerramento forçado. Não apagar o lock para tentar liberar uma operação ativa.

Sem confirmação: recuperar a biblioteca anterior quando já tiver sido movida; a nova extração pode ficar retida no staging para inspeção. Com confirmação: manter a biblioteca nova e seu backup anterior. Registros inválidos, caminhos inesperados ou estados ambíguos bloqueiam a inicialização em vez de adivinhar quais arquivos excluir.

## Supervisor nativo

O processo de restauração tem limite de 20 minutos. Após esse prazo, o supervisor tenta encerrar **seu próprio processo** e espera até 15 segundos pelo evento de término. Só após confirmar o término pode reiniciar o serviço, que primeiro recupera o journal.

Sem confirmação de término, a sessão permanece em manutenção: não inicia servidor nem permite novas operações nativas de playlist sobre uma restauração possivelmente ativa. Ao reabrir, o lock entre processos impede o novo serviço de disputar os dados com um processo remanescente.

Um `RwLock` nativo espera as operações de playlist já em execução terminarem antes de iniciar a restauração. Operações enfileiradas verificam novamente manutenção ao obter acesso.

A mensagem de falha informa que o serviço recuperou uma biblioteca consistente; não promete que o resultado seja sempre a biblioteca antiga, pois a transação pode ter sido confirmada antes de o processo parar.

## Verificação

Testes com diretórios e processos reais temporários reproduzem:

- processo parado antes da troca, sem alterar o original;
- interrupção depois de mover a biblioteca anterior;
- interrupção depois de instalar a nova, antes de confirmar;
- interrupção após confirmação, preservando biblioteca nova e backup anterior;
- lock impedindo recuperação enquanto o worker ainda está vivo;
- rollback bloqueado por erro de arquivo e recuperação na próxima tentativa;
- inicialização recuperando o original antes de criar uma pasta ausente;
- journal inválido sem movimentar a biblioteca.

O helper Rust testa sucesso sem kill, timeout com confirmação de encerramento, falha ao encerrar, falta de confirmação e perda do canal. As regressões anteriores de ZIP, hash, banco e restauração instalada continuam na suíte.

Limites: os testes de falha usam bibliotecas sintéticas; não validam todas as interações de antivírus, ACL ou armazenamento do computador do usuário. O protocolo cobre interrupção de processo; não foi validada a durabilidade sob queda de energia/disco defeituoso. A validação física do instalador continua necessária.

## Instalador de teste

O workflow desktop-preview prepara `BZtune Preview`, identificador separado e biblioteca em `%LOCALAPPDATA%/BZtune-Preview/library`, quando compilado com `BZTUNE_DESKTOP_PREVIEW=1`. O Preview ignora overrides globais de `BZTUNE_LIBRARY_DIR` para não herdar um caminho de produção. Builds normais mantêm `%LOCALAPPDATA%/BZtune/library`.

Fechar o BZtune principal antes de instalar e abrir o Preview: os serviços continuam usando a mesma porta local 5000. Testar com cópias de arquivos e backups sintéticos. O Preview não habilita atualização automática de distribuição. Instalador concluído na [execução Windows 42541374112](https://github.com/BadZ7br/BZtune/actions/runs/42541374112), commit `2e160e3`. Na página, baixar o artefato **BZtune-Desktop-Windows-Preview**, extrair o ZIP e executar o instalador EXE. É necessário estar conectado ao GitHub para baixar o artefato; retenção configurada de 14 dias.

Resultado: workflow Windows aprovado, incluindo os oito testes de consistência de backup, oito testes de transação/processos, quatro casos Rust do supervisor, compilação NSIS e envio do artefato. Suíte local completa: 256 casos Python, um ignorado, sem falhas; 128 testes JavaScript aprovados.

A execução intermediária 42540920838 detectou divergência entre caminhos abreviados Windows e canônicos; corrigida com normalização dos caminhos do journal e regressão explícita via GetShortPathNameW. A execução final passou. O primeiro instalador 42539919108 é anterior a essa correção; usar o artefato da execução final acima.

O digest informado pelo GitHub para o arquivo agregado do artefato é `470197f7e957c09b6dfd2f429f607a08283fca2f65142ea6c91057c7e6a4e31f`; não é uma assinatura de distribuição nem o hash do EXE extraído. Não foi executada instalação física no computador do usuário ou atualização pública.

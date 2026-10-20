# Correções das pendências — 20/10/2026

Esta é a situação posterior às análises do repositório, do vídeo e das implementações. As análises anteriores são registros do diagnóstico inicial; suas tabelas de reprovação não descrevem o código corrigido desta branch.

Branch: `fix/remaining-regressions-2026-10-20`. Base: `22ebe56` (versão pública 2.0.6). Os commits separam frontend, restauração/desktop e distribuição. Esta branch ainda não foi integrada à main nem gerou uma nova atualização pública.

## Alterações por pendência da auditoria

| Item | Correção implementada | Evidência e limite |
| --- | --- | --- |
| 1 — armazenamento/tela vazia | Leitura e gravação seguras da última aba e das letras; aviso e nova tentativa para favoritos, coleção e navegação; limite de erros React com recuperação. | Falha de gravação reproduzida novamente no Chromium: interface preservada, aviso visível e nenhum erro de página. Teste unitário confirma que a nova tentativa usa o último valor. |
| 2 — pesquisa inválida | Validação dos resultados e seus membros antes de atualizar estado, prazo de 15 s e botão para repetir. | HTTP 200 sem `results` produz erro recuperável e preserva a navegação. Teste de repetição passou. |
| 3 — Tauri debug | Sonda da API externa usando a origem do Vite antes de marcar o serviço pronto; não assume posse do processo externo. | Código corrigido; o frontend mantém a recuperação após 45 s se o serviço não responder. A execução completa de `tauri dev` ainda depende da plataforma gráfica. |
| 4 — restauração instalada | Comando nativo usa o caminho de dados da aplicação e o hash do upload revisado; encerra o sidecar, executa manutenção e reinicia o serviço. O serviço de restauração é empacotável, sem checkout do projeto. | Biblioteca temporária em caminho de instalação restaurada; estado anterior retido; falha simulada da troca desfaz a renomeação. UI verifica hash, diálogo de espera e erro nativo visível. A entrada Python de manutenção restaurou o hash correto e recusou hash alterado sem substituir dados. Executável instalado ainda precisa de teste Windows. |
| 5 — backup inconsistente | Reserva de escrita SQLite durante snapshot/cópia; hash calculado dos mesmos bytes enviados ao ZIP; validação de áudio referenciado e hash conhecido do banco; uploads temporários únicos. | Ausência e divergência de áudio são recusadas; escritor concorrente aguarda o fim da exportação; roundtrip e rollback passaram. Escritas concorrentes podem aguardar ou atingir o prazo do SQLite em bibliotecas grandes. |
| 6 — gravação errada | Player e pré-carregamento usam o matcher compartilhado: ID de origem ou álbum com correspondência única; título/artista sozinhos não autorizam troca automática. | Fixture Studio × Live permaneceu online e não escolheu o arquivo Live. Correspondências ambíguas ficam sem seleção automática. |
| 7 — interoperabilidade Windows | Fechamento determinístico das conexões SQLite; UTF-8 explícito no subprocesso de teste; interoperabilidade e núcleo Rust tornam-se requisitos da publicação. | Interoperabilidade aprovada novamente em Linux e Windows no GitHub; integração Tauri compilou no Windows. A causa exata da falha anterior não foi afirmada sem seus logs. |
| 8 — origem externa na API web | Política de origem aplicada antes de todas as rotas; CORS restrito e preflight de rede local permitido para as origens locais autorizadas. | POST externo em playlists recebe 403 sem concessão CORS; preflight local preservado. |
| 9 — cache do player | Removido cache próprio sem invalidação; resolução e pré-carregamento acompanham a biblioteca compartilhada e seus eventos de alteração. | Reprodução, troca de fonte e reabertura passaram com áudio real sintético. Erros de consulta não são guardados como ausência definitiva. |
| 10 — estatísticas | Motor informa reprodução efetiva e fonte resolvida; buffering, falha e pausa não contam como áudio tocando. Progresso só é reconhecido após HTTP bem-sucedido e é reenviado com o mesmo ID de sessão. | Resposta 500 seguida de 200 produziu duas tentativas com mesmo ID e fonte local; áudios ausentes/travados não enviaram escutas. |
| 11 — consultas e prazos | Downloads sem atividade não são consultados pela tela oculta; cadência de 1,2 s fica para tarefas ativas. Requisições comuns têm prazo de 30 s e cancelamento; upload/verificação de backup permite 10 min. | Home oculta não fez polling de downloads; prazo e cancelamento do chamador testados. Consultas iniciadas antes de ocultar uma tela ainda podem terminar dentro do prazo. |
| 12 — persistência/importação JSON | Aviso para gravações pendentes; importação valida todas as chaves e estruturas antes de gravar, e restaura valores anteriores se uma gravação intermediária falhar. | Testes de chave desconhecida, fila inválida e falha intermediária passaram. Se o armazenamento também recusar o rollback, o erro explica a recuperação incompleta; não há promessa de transação fornecida pelo localStorage. |
| 13 — CSP | Política explícita para scripts, frames, fontes, imagens, áudio e conexões; bloqueio de objetos e formulários; política separada para Vite. | Build de produção permitiu o adaptador simulado do YouTube e bloqueou script de origem externa. **Parcial:** o script oficial do YouTube continua no contexto principal; isolamento completo do provedor permanece trabalho arquitetural. Não foi alegada exploração ou homologação de vídeos reais. |
| 14 — dependências | Versões diretas Python fixadas; lock Windows/Python 3.12 com dependências transitivas de empacotamento; lock npm do desktop e `npm ci`; Actions migradas para versões com Node 24. | Pacotes Windows resolvidos/baixados; testes locais passaram. **Parcial:** imagem do runner, Rust stable e distribuição FFmpeg ainda podem mudar; não é garantia de binários idênticos. |
| 15 — publicação | Publicação oficial por execução manual da main, mantendo o ambiente protegido; removido gatilho por tag incompatível. Workflow antigo de teste deixa de forçar versão 2.0.5. | Testes do fluxo passaram. Segredos e proteção do ambiente mantidos. Nenhuma release pública nova nesta etapa. |
| 16 — interface/textos | Abertura de álbum/artista pelo topo; indicação de catálogo carregando; mensagens de serviço local; miniaturas do player acessíveis por rolagem em altura curta. | 162 combinações de largura, altura, fonte, densidade e fila aberta/fechada passaram. A folha CSS grande permanece dívida de manutenção, sem reescrita geral nesta correção. |

## Problemas do vídeo e do álbum

- Capas por faixa ou capa do álbum, fallback para imagem inválida, ícones distintos e ações agrupadas: nove perfis de largura/tema aprovados.
- Arraste HTML5 liberado na configuração da janela Tauri (`dragDropEnabled: false`); arraste e continuidade da faixa aprovados no Chromium. Teste no WebView2 instalado ainda necessário.
- Áudio em carregamento mostra estado visível, falha após 15 s e oferece nova tentativa. Erro de arquivo e rejeição de `play()` também permitem recuperação. Carregamento online ganhou prazo e nova tentativa, com erro visível também no mini-player e sem aviso sobreposto ao botão. A falha do script do YouTube seguida de nova tentativa passou com um adaptador controlado.
- O arquivo específico “NORMAL (Explicit Ver.)” mostrado no vídeo não foi disponibilizado para diagnóstico. O tratamento de falhas foi corrigido, mas não se atribuiu causa nem se declarou recuperado aquele arquivo.

## Validação local

- Build TypeScript/Vite de produção aprovado.
- 58 testes JavaScript aprovados.
- 173 testes Python executados: 172 aprovados; 1 ignorado por exigir bloqueio real de arquivo no Windows.
- 8 testes do núcleo Rust aprovados; interoperabilidade Python ↔ Rust aprovada em Linux.
- Navegador: persistência indisponível e pesquisa inválida preservam a interface; 30 cenários de salvamento da personalização; pesquisa/foco; temas completos; modal de atualização; nove perfis de álbum; arraste; áudio local, pausa, volume, seek, fila, letras, equalizador, crossfade e reabertura.
- Falhas de áudio: arquivo ausente, `play()` recusado e carregamento travado recuperaram por nova tentativa; retry de estatísticas após HTTP 500 preservou idempotência.
- Player expandido: 162 combinações de janela/fonte/densidade/fila verificadas; miniaturas com alvo mínimo de 44 px acessíveis após rolagem.
- CSP do build de produção e integração da UI de restauração exercitados com provedor/ponte simulados. Esses cenários não substituem WebView2, NSIS e atualização real.

O roteiro de regressão do botão de recuperação online está preservado em [tests/browser/online-player-recovery.cjs](../tests/browser/online-player-recovery.cjs), com [instruções de execução](../tests/browser/README.md).

Os testes usam dados e áudio sintéticos. Não alteraram a biblioteca pessoal nem enviaram músicas ou diagnósticos para terceiros.

## Verificação nativa e limites restantes

Execução do GitHub **aprovada em Windows e Linux**, para o código Rust desta branch: [Native core — Windows e Linux](https://github.com/BadZ7br/BZtune/actions/runs/39467636195), commit `a0ca25f`, duração 4 min 55 s. O job Windows prepara os recursos reais e executa `cargo check --locked` da integração Tauri, além dos testes e da interoperabilidade. A execução [43ae473 — CSS, validação JSON e Actions atualizadas](https://github.com/BadZ7br/BZtune/actions/runs/39468680695) também foi aprovada em Windows e Linux (6 min 7 s). A execução [d94116c — recuperação do mini-player](https://github.com/BadZ7br/BZtune/actions/runs/39469234217) foi aprovada (5 min 58 s).

A matriz [8cee562 — suítes completas Windows/Linux](https://github.com/BadZ7br/BZtune/actions/runs/39469996634) foi **aprovada** (6 min). Executou toda a suíte Python e JavaScript nas duas plataformas, os testes Rust, a interoperabilidade e a preparação/compilação da integração Tauri no Windows. O teste de bloqueio real de arquivo, ignorado no Linux, foi habilitado no Windows e passou. O endurecimento posterior da validação do campo `year` em pesquisa/importação foi conferido pelos 58 testes JS e pelo build local.

Ainda exigem o aplicativo instalado em Windows: restauração pelo sidecar empacotado, arraste no WebView2 e atualização HTTPS com fechamento/reabertura e preservação de dados. O aplicativo Android e a retirada completa de Python/HTTP continuam objetivos arquiteturais separados. Essas limitações não foram apresentadas como correções concluídas.

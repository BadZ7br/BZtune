# Alternativas simplificadas do player expandido

São propostas visuais para escolha do layout. Os PNGs mostram protótipos HTML com dados fictícios; o código do player de produção permanece na implementação existente. Os controles do protótipo demonstram navegação e estados, sem reproduzir mídia real ou acessar biblioteca pessoal.

| Proposta | Organização | Indicação |
| --- | --- | --- |
| A — Dueto | Capa e título à esquerda, letras à direita, transporte no rodapé | Equilíbrio entre identidade do álbum e leitura; recomendação inicial |
| B — Imersivo | Capa pequena no cabeçalho, letras centralizadas e maiores | Prioridade à leitura e aparência de tela de reprodução |
| C — Compacto | Cartão central com capa menor e abas Letra/Fila | Interface discreta e familiar, com menos ocupação da janela |

Os três modelos exibem os controles anterior, pausa/reprodução e próxima, a barra de posição, acesso à fila, volume e menu de opções. Equalizador, histórico, crossfade, playlists e downloads aparecem sob demanda. Quando aleatório ou repetição estiverem ativos, a interface deverá indicar o estado mesmo com o menu fechado.

## Contrato de preservação de funcionalidades

| Funcionalidade existente | Acesso proposto nos três modelos |
| --- | --- |
| Reproduzir/pausar, anterior, próxima e posição | Transporte e barra sempre visíveis |
| Volume e silenciar | Botão de volume com controle flutuante; teclado preservado |
| Aleatório e repetição desligada/fila/uma faixa | Menu → Reprodução, com indicador persistente quando ativos |
| Fila, reprodução de uma entrada, arraste, subir/descer, remoção e limpeza | Painel Fila; controles por hover/foco, preservando acesso pelo teclado |
| Acrescentar arquivos da biblioteca à fila | Painel Fila → Adicionar músicas da biblioteca |
| Adicionar faixa local ou online a playlist | Menu → Adicionar à playlist, usando os componentes atuais |
| Download, situação offline e gerenciamento da biblioteca | Menu → Downloads e biblioteca; indicação de faixa já salva |
| YouTube, erro, nova tentativa e versões alternativas | Área de vídeo quando a fonte exigir e Menu → Vídeo e alternativas; erros de reprodução continuam visíveis |
| Letras automáticas, cache, LRC manual e fonte selecionada | Mesmo fluxo existente, painel Letra e Menu → Opções da letra |
| Texto simples, sincronizado, instrumental e falhas de consulta | Estados específicos no mesmo painel de leitura |
| Rolagem com linha ativa e leitura manual | Acompanhamento automático; retomada disponível após rolar manualmente |
| Equalizador local | Menu → Equalizador |
| Crossfade e restrições com shuffle/repeat | Menu → Crossfade |
| Histórico e limpeza | Menu → Histórico |
| Minimizar, expandir e parar/fechar | Cabeçalho e menu; atalhos existentes mantidos |
| Persistência, biblioteca e atualizações | Serviços e armazenamento atuais, sem alterações necessárias ao escolher o layout |

A aplicação do modelo escolhido deve reorganizar os componentes existentes. O comportamento real de áudio, YouTube, sincronização, persistência e erro precisa passar pelas regressões do aplicativo depois da integração. A disponibilidade de recursos continua condicionada à fonte local/online e aos dados da faixa.

## Arquivos e validação

- `01-dueto.png`, `02-imersivo.png`, `03-compacto.png`: telas iniciais sem painéis abertos.
- `04-menu-de-funcoes.png`: exemplo de acesso às funções secundárias.
- `index.html?layout=a`, `index.html?layout=b`, `index.html?layout=c`: protótipos para navegação em navegador local.
- `cover.svg`: arte e metadados fictícios, usados somente na demonstração.

Para gerar as imagens: `CHROMIUM_PATH=/usr/bin/chromium node scripts/preview_player_alternatives.cjs`. O script inicia um servidor temporário local, captura PNGs em 1600×1000 e verifica controles básicos, entradas do menu, painel de equalizador, remoção de item da fila e limites da janela em 960×640. Sem `CHROMIUM_PATH`, utiliza o navegador instalado pelo Playwright. Essa verificação cobre o protótipo visual; não equivale a validar novamente a reprodução no aplicativo.

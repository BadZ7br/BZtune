# Análise da gravação de 20/10/2026, 13h42

> Registro do diagnóstico anterior às correções desta branch. Consulte a [situação atual e os limites de validação](CORRECOES_PENDENCIAS_2026-10-20.md).

Arquivo recebido: `2026-10-20 13-42-52.mp4`. Duração: aproximadamente 1min02s; imagem 1920×1080, 60 fps. Os horários abaixo são posições aproximadas dentro do vídeo.

A análise examinou quadros distribuídos por toda a gravação, ampliou os momentos relevantes e revisou a tentativa de arraste em intervalos de meio segundo. Os comportamentos foram comparados ao código atual do repositório, sem executar alterações funcionais. O vídeo não mostra o número da versão instalada; não é possível assegurar apenas pela aparência que o binário é exatamente o commit analisado.

## O que a gravação acrescenta à auditoria

O aplicativo instalado abre, navega e carrega informações. Não há tela branca nem encerramento inesperado nesta gravação. Ela não reproduz os cenários artificiais de storage e JSON inválido da auditoria anterior; portanto, não confirma nem elimina esses problemas condicionais.

O foco deste vídeo é diferente: há sinais concretos de dificuldade na fila, falta de progresso depois de uma troca de faixa e problemas de disposição/feedback de carregamento. Eles merecem uma investigação própria antes de retomar os itens anteriores.

## 1. Tentativa de reordenar a fila sem resultado visível

**Trecho: aproximadamente 00:04–00:11.**

A faixa `See You In Hell`, do Electric Wizard, é arrastada na fila. A linha aparece esmaecida durante a interação e o cursor de operação proibida fica visível. A ordem apresentada permanece a mesma: `NORMAL (Explicit Ver.)`, `See You In Hell`, `Angry American`, etc.

Isso mostra que as tentativas registradas não produziram uma mudança visível. Não demonstra, sozinho, que toda forma de ordenar está quebrada: as setas não foram demonstradas como uma tentativa concluída de reordenação nessa sequência.

**Indício técnico forte:** a fila de `MusicPlayer.tsx` utiliza `draggable`, `dataTransfer`, `onDragOver` e `onDrop` do HTML5. A janela em `tauri.conf.json` não define `dragDropEnabled`, cujo padrão é `true`. A documentação do Tauri disponível no código de `tauri-utils` declara expressamente que desabilitar o handler nativo é necessário para utilizar o drag and drop HTML5 no frontend Windows, pois ele substitui o handler do WebView2.

Existe, portanto, uma incompatibilidade concreta da configuração com o mecanismo escolhido pela fila. É uma hipótese de causa com sustentação técnica forte; sua confirmação exige repetir a interação no WebView2 após uma mudança controlada e verificar os eventos recebidos. Também deve ser preservado o comportamento desejado para importação de arquivos por arraste, caso exista.

**Prioridade sugerida:** alta, pois é uma função anunciada diretamente na interface.

## 2. Player permanece em 0:00 / 0:00 depois de selecionar outra faixa

**Trecho: aproximadamente 00:19–00:59.**

Antes da troca, `Angry American` mostra progresso crescente, duração de 3:14 e fonte offline. Depois da seleção de `NORMAL (Explicit Ver.)`, do BTS, a identificação do mini-player muda, mas os dois tempos ficam em zero. O botão central aparece esmaecido com símbolo de pausa, e essa condição persiste enquanto o usuário navega pelo catálogo.

**Confirmado visualmente:** o player fica sem progresso/duração informados durante cerca de 40 segundos e não apresenta uma explicação clara visível nessa área.

**Não confirmado pelo vídeo:** se o arquivo está ausente, se a resposta HTTP demora, se o áudio foi recusado pelo WebView2, se o estado do elemento de áudio não foi atualizado ou se outra etapa da troca ficou pendente. A gravação não contém rede, console ou erro do elemento de áudio. Não é correto atribuir isso automaticamente a codec, arquivo corrompido, YouTube ou backend encerrado.

O próximo diagnóstico deve registrar `currentSrc`, `readyState`, `networkState`, `error`, status/resposta da URL de áudio e a sequência `loadstart` → `loadedmetadata` → `canplay` → `playing`/`error`. Também precisa conferir qual dos dois elementos de áudio está ativo. O código atual usa dois decks e o botão depende de `ready`, mas seu símbolo depende de `isPlaying`; esses estados diferentes explicam como a aparência pode ficar incoerente sem identificar a causa inicial.

**Prioridade sugerida:** a mais alta entre os problemas do vídeo, porque impede confirmar/iniciar a reprodução da faixa escolhida e oferece pouca recuperação.

## 3. Ações das faixas quebram para uma segunda linha

**Trechos: aproximadamente 00:25–00:31 e 00:57–00:59.**

Nas faixas dos álbuns, o botão de adicionar à playlist aparece sozinho embaixo, próximo à coluna do número da faixa. O hover cobre um bloco alto com essa segunda linha, mesmo em uma janela larga. O mesmo padrão aparece no álbum do BTS e no EP do Fu Manchu.

**Correspondência no código:** `.dv-album-track` define seis colunas. O componente pode renderizar número, nome/play, duração, tocar a seguir, adicionar à fila, download e adicionar à playlist: sete elementos, além dos controles condicionais de fonte. O elemento adicional passa para a próxima linha por posicionamento automático do grid. Existe uma regra própria para a fonte híbrida na segunda linha, mas ela não resolve o posicionamento do botão de playlist.

Isso sustenta uma causa de layout, não uma diferença de resolução do vídeo. A linha precisa de um grupo explícito de ações e de uma organização responsiva para os controles extras.

Os botões “tocar a seguir” e “adicionar à fila” também usam o mesmo ícone no componente atual, dificultando distinguir duas ações próximas.

**Prioridade sugerida:** média; falha visual confirmada e de escopo bem delimitado.

## 4. Navegação abre conteúdo com o topo já fora da tela

**Trechos: aproximadamente 00:22–00:25 e 00:56–00:59.**

Ao entrar em detalhes, partes do cabeçalho/capa e o botão de voltar ficam fora da área inicialmente visível. Não se trata necessariamente de conteúdo perdido: a rolagem permite reencontrá-lo. A experiência é de entrar no meio da página.

**Correspondência no código:** `openAlbum` e `openArtist` mudam o estado de página, sem uma política explícita de rolagem/foco. Não encontrei uma rotina central de restauração de rolagem nas telas examinadas.

O vídeo também contém rolagens feitas pelo usuário; por isso, nem todo título cortado deve ser classificado como defeito. O ponto a validar é a posição imediatamente após a navegação. O comportamento desejável deve ser definido: abrir detalhes pelo topo, preservando separadamente a posição anterior ao voltar.

**Prioridade sugerida:** média.

## 5. Carregamento de catálogo e imagens oferece sinais contraditórios

**Trechos: aproximadamente 00:35–00:45 e 00:46–00:54.**

Durante a busca e abertura do perfil de Fu Manchu, há períodos de área vazia e vários espaços de imagem ainda sem capa/foto. Parte das imagens aparece depois. Portanto, não é correto dizer que todas as capas estão permanentemente quebradas.

Na abertura do artista, a tela informa `0 lançamentos encontrados` enquanto mostra que a discografia está sendo consultada. Depois passa a informar 32. O número inicial não representa uma conclusão real da busca: resulta de apresentar o comprimento de uma lista ainda não carregada.

O código de `ArtistPage.tsx` confirma essa apresentação: a contagem usa `albums.length` mesmo com `loading` verdadeiro. Na pesquisa, o indicador só começa depois do debounce, e respostas de consultas anteriores podem permanecer brevemente visíveis.

**Recomendação:** distinguir carregando, sem resultados e erro; oferecer estado de carregamento para imagens e uma tentativa de recuperação para falhas. Medir as requisições antes de culpar a internet ou o backend pelo tempo de espera.

**Prioridade sugerida:** média.

## 6. Miniaturas do player expandido parecem cortadas

**Trecho: aproximadamente 00:02–00:11.**

A faixa de capas pequenas abaixo da imagem principal encosta no limite inferior do painel e aparece parcialmente recortada. Isso prejudica a leitura e o uso das miniaturas.

É um indício visual de dimensionamento/overflow. A gravação não basta para afirmar qual regra CSS precisa mudar; o teste deve considerar altura útil da janela, tamanho de fonte, densidade e fila aberta/fechada, sem retirar a acessibilidade ou esconder controles.

**Prioridade sugerida:** menor que reprodução e fila.

## O que funcionou durante a gravação

- A faixa inicial apresenta progresso crescente e o estado é mantido ao minimizar o player.
- As áreas de navegação respondem e as estatísticas são exibidas.
- As faixas do álbum do BTS e a discografia de Fu Manchu chegam a carregar.
- A busca preserva o texto e a interface apresenta os perfis homônimos separadamente.
- O foco da pesquisa aparece contornando o campo completo. Não vejo o antigo problema de um destaque restrito e deslocado dentro do texto nesse trecho.

Esses pontos observados não substituem testes completos de cada função.

## Limites sobre áudio, versão e desempenho

A faixa AAC da gravação está praticamente silenciosa: nível médio aproximado de -87 dBFS, com um pico breve de -40,9 dBFS. Não há base para avaliar qualidade musical, estalos ou crossfade audível. O avanço do relógio da faixa inicial confirma progresso visual, não que o som estivesse chegando ao dispositivo de saída. A ausência de som na gravação também não prova falha de reprodução no aplicativo.

O vídeo não exibe a versão instalada nem os detalhes de uma instalação/atualização. Não comprova que o item de aceitação do updater foi concluído. Ele também não permite medir CPU, memória, gargalo de rede ou perda de frames do próprio aplicativo com precisão.

## Ordem sugerida antes de retomar a auditoria geral

1. Diagnosticar a faixa que fica em `0:00 / 0:00`, tornando o estado de erro/carregamento visível.
2. Resolver a incompatibilidade de arraste da fila no WebView2 e validar a ordem efetiva.
3. Corrigir a disposição das ações nas linhas de faixas.
4. Definir navegação com rolagem/foco coerentes.
5. Melhorar os estados de carregamento do catálogo/imagens e ajustar as miniaturas do player.

Os itens deste documento descrevem o vídeo; não substituem nem renumeram automaticamente os 16 itens do relatório anterior. Nenhuma correção foi aplicada nesta etapa.

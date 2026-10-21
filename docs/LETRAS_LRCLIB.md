# Letras com LRCLIB

Ao abrir o player expandido, o painel de letras aparece automaticamente. Se houver uma letra salva, ela é usada sem consulta externa; caso contrário, o aplicativo busca no LRCLIB. A mesma lógica se aplica ao trocar de faixa com o player expandido aberto. A consulta envia título, artista, álbum (se disponível) e duração (quando conhecida e entre 1 e 3600 segundos). Não exige conta ou chave de API. Não faz upload de áudio.

A duração só é enviada quando pertence à faixa atual e o player está pronto. Importações e buscas compartilham cancelamento, de modo que a última operação iniciada prevalece.

O backend consulta `GET https://lrclib.net/api/get`, por meio de `GET /api/lyrics`, com timeout, destino fixo e limite de 1 MiB dos bytes descomprimidos recebidos, verificado antes de interpretar o JSON. Cada campo de letra tem limite de 250 KB. Não utiliza busca aproximada como fallback: uma gravação sem correspondência pode retornar sem resultado. Metadados incorretos podem impedir a localização da letra.

O player prioriza a letra sincronizada; se houver apenas texto simples, exibe sem destaque temporal. Faixas instrumentais recebem uma indicação. Erros e ausência de resultado preservam a letra já exibida. Trocar a faixa cancela a busca na interface e impede que sua resposta apareça na faixa seguinte; a requisição já iniciada pelo backend pode terminar até seu timeout.

Resultados ficam no armazenamento local por identificador de faixa, sob `bztune-lyrics-v1:`, e participam do backup JSON de configurações. O botão de atualizar permite buscar novamente; um resultado bem-sucedido seleciona o LRCLIB, preservando o arquivo manual. Os controles de importação e fonte ficam em **Opções da letra**. Os botões “Usar LRC importado” e “Usar LRCLIB salvo” permitem alternar a fonte; a seleção também participa do backup JSON. Falha de armazenamento gera aviso e mantém o resultado apenas na sessão. Letras locais e online com identificadores diferentes ainda têm caches separados.

A importação `.lrc` continua disponível. Ao restaurar, a seleção salva determina a fonte; sem seleção anterior, um LRC manual válido tem prioridade. Arquivos sem timestamps válidos são recusados antes de substituir a letra anterior. O parser suporta timestamps múltiplos e offset LRC em milissegundos. As linhas sincronizadas acompanham a posição de reprodução. Rolar com mouse, toque ou teclas interrompe o acompanhamento, que pode ser retomado pelo botão **Acompanhar letra**. A animação respeita a preferência de movimento reduzido. Não há sincronização por palavra.

Validação: build TypeScript/Vite; testes de contrato HTTP; testes de respostas sincronizadas, simples e instrumentais, ausência de letras, timeout e falhas externas; testes do parser, cliente e backup. O endpoint real do LRCLIB não pôde ser acessado pela rede do ambiente; os testes HTTP usam respostas simuladas. O contrato foi conferido no código público do servidor LRCLIB, commit `04369d3f7c6e8cba1790629f26f866547a9b8f88`.

A versão 2.0.8 foi compilada e publicada pelo workflow assinado existente. O manifesto público `latest.json` anuncia 2.0.8, o instalador e seu arquivo `.sig` foram baixados para conferência, e o identificador da chave de assinatura é o mesmo da 2.0.7. Para o Android, o contrato de letras fica separado do componente visual, mas o transporte HTTP local ainda precisará de um adaptador mobile.

## Verificação da publicação 2.0.8

- Commit da release: `c30732fd35dba0dd2a679e9411892ee8f5a9c2a3` (tag `v2.0.8`).
- [Workflow de publicação aprovado](https://github.com/BadZ7br/BZtune/actions/runs/39525576579): testes Python/JavaScript, build React, regressões de navegador no Windows, interoperabilidade Rust/Python, empacotamento e validação criptográfica antes da publicação.
- [Workflow do núcleo nativo aprovado](https://github.com/BadZ7br/BZtune/actions/runs/39525576584).
- Instalador público: `BZtune-Setup-v2.0.8-x64.exe`, 89.085.595 bytes.
- SHA-256: `952a7dd9989ca94fd2dab542a5d67cfbbfd7496996f9dfd3acf6e37bb1afa478`.
- Assinatura do manifesto idêntica à do arquivo `.sig`; comentário autenticado inclui `version:2.0.8`.
- Atualização pelo aplicativo: **Sistema → Atualizações → Buscar atualizações → Atualizar agora**.

A execução de uma atualização no computador do usuário não foi testada neste ambiente. A conferência pública comparou os identificadores de chave e os arquivos; a verificação criptográfica completa foi executada pelo workflow de publicação com a chave pública esperada.

## Prévia do novo painel expandido

O novo layout reserva um painel central para as letras, com capa e controles à esquerda e fila à direita. Ao ocultar a fila, o espaço de leitura aumenta. Letras sem timestamps mantêm quebras de verso e não exibem sincronização fictícia. O layout usa as cores do tema e foi conferido em 1600×1000, 1440×900, 1366×768 e 960×640.

Para gerar PNGs da interface com dados inteiramente fictícios, inicie o Vite e execute `CHROMIUM_PATH=/usr/bin/chromium node scripts/preview_player_lyrics.cjs` (sem a variável, usa o navegador instalado pelo Playwright). Os arquivos são salvos em `docs/previews/player-lyrics`; nenhum arquivo pessoal ou serviço real de mídia é utilizado.

Este redesenho é posterior à release 2.0.8; não faz parte do instalador dessa versão.

## Precisão e identidade do relógio

A posição e a duração agora pertencem a uma ativação específica: identidade da faixa, fonte de áudio e tentativa de reprodução. Cada transição gera um token novo, inclusive A→B→A; amostras antigas são ignoradas e a apresentação começa em zero até receber o tempo da nova mídia. A posição real já avançada da entrada no crossfade é preservada após a troca do contexto.

Com o player expandido, a letra aberta e a página visível, a consulta ao relógio da mídia ocorre a cada 100 ms. No mini-player, em outras ferramentas ou com a página oculta, o intervalo é de 600 ms. Ao mudar a visibilidade, o relógio é consultado imediatamente. São intervalos solicitados ao navegador, sujeitos à carga e às suas políticas de agendamento; não representam garantia de latência absoluta.

O tempo é lido diretamente do áudio local ou da API do player de YouTube. Não há avanço estimado por cronômetro durante pausa ou buffering. O relógio não é usado para movimentar o áudio. Eventos locais só atualizam o progresso quando pertencem ao deck ativo e à URL atual. Amostras iguais evitam atualizações desnecessárias de estado.

O workflow de publicação também executa `tests/browser/lyrics-clock.cjs`. A mudança no relógio é posterior à release 2.0.8 e não publica, por si só, uma nova atualização.

## Ajuste de sincronização por gravação

Em **Letra → ⋯ → Sincronização da letra**, use **−100** para adiantar e **+100** para atrasar o destaque em passos de 100 ms. O limite é de −30.000 a +30.000 ms. O valor aparece no menu e, quando diferente de zero, junto da indicação de letra sincronizada. O controle fica desativado para texto simples e faixas instrumentais sem timestamps.

O ajuste desloca somente o destaque, sem executar seek ou alterar o tempo de reprodução. Valores positivos atrasam o verso; negativos o adiantam. O offset embutido no LRC continua sendo aplicado pelo parser. **Restaurar sincronização** zera apenas o ajuste manual, preservando o arquivo original e seu offset.

Os valores são guardados por identificador de música, fonte de reprodução (local/online) e fonte da letra (arquivo manual/LRCLIB). Trocar de música ou de fonte recupera seu próprio valor. Uma nova importação da mesma fonte mantém a preferência daquela gravação até que o usuário a restaure. Duplicatas com identificadores diferentes têm ajustes independentes.

As chaves `bztune-lyrics-offset-v1:<local|online>:<manual|lrclib>:<id>` participam do backup JSON. Somente inteiros múltiplos de 100 dentro do limite são aceitos na restauração; uma entrada inválida bloqueia a importação antes de gravar os dados. Falhas ao salvar preservam o ajuste em memória na sessão e utilizam o mecanismo existente de nova tentativa de armazenamento.

Testes adicionados: adiantamento/atraso nos limites entre versos, composição com o offset LRC, preservação do texto, validação do backup, manutenção após recarga, isolamento entre músicas e fontes, restauração do valor zero e ausência de seek no áudio. A mudança continua posterior à release 2.0.8 e não publica automaticamente outro instalador.

## Parser fiel e versos simultâneos

O parser interpreta os timestamps iniciais de cada linha e preserva o texto que vem depois deles, incluindo trechos como `[refrão]`, `[echo]`, colchetes incompletos e timestamps citados dentro de um verso. Linhas de metadados sem timestamp de canto, como `[ar:...]` e `[ti:...]`, não viram versos. `[offset:...]` é reconhecido como metadado somente quando ocupa uma linha própria; uma menção dentro da letra permanece literal.

Entradas com o mesmo horário formam um bloco único, mantendo a ordem original e separadas por quebras de linha. Isso permite destacar original e tradução juntos. Cada bloco participa do ajuste manual de atraso e da rolagem como um trecho sincronizado. Timestamps repetidos na mesma linha não duplicam o mesmo texto naquele horário.

Os tempos são calculados em milissegundos antes da conversão para segundos. Continuam disponíveis frações, vários timestamps iniciais, offset LRC e o ajuste manual salvo. São aceitas quebras de linha LF, CRLF e CR. Um offset que não possa ser representado como número finito é ignorado. O conteúdo bruto importado ou recebido do LRCLIB não é reescrito, preservando os backups e as letras já salvas; o agrupamento acontece na leitura.

Regressões: preservação de texto entre colchetes, metadados fora dos versos, tradução simultânea, ordem dos blocos, timestamps equivalentes (`.0`/`.000`), múltiplos timestamps, offsets positivos/negativos, composição com o ajuste manual e destaque multilinear no navegador para arquivos importados e respostas LRCLIB simuladas.

## Rolagem e leitura manual

Trocar a música ou a fonte da letra reinicia a leitura. Letras simples e introduções anteriores ao primeiro verso começam no topo; letras sincronizadas reposicionam o bloco ativo. Mudanças no tamanho da janela, no espaço do painel ou na fonte recalculam a posição, inclusive com a música pausada. Blocos com tradução permanecem inteiramente visíveis quando cabem na área de leitura.

Mouse, toque, clique na área de leitura e teclas de navegação suspendem o acompanhamento e interrompem a animação em andamento. A posição manual é preservada durante mudanças de verso e de tamanho do painel, até usar **Acompanhar letra**. Espaço com foco na área de leitura rola o texto sem acionar o atalho global de reprodução.

Versos consecutivos usam rolagem suave; saltos maiores reposicionam imediatamente. A preferência de movimento reduzido desativa a animação. Essas operações só movimentam a área de leitura, sem alterar o relógio ou executar seek. A correção é posterior à release 2.0.8 e não publica automaticamente uma atualização.

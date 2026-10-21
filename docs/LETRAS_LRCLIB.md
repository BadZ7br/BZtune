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

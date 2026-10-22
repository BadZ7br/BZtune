BZtune 2.0.9 — correções de estabilidade, backup e interface.

Esta atualização reúne as correções F01, F02, F03 e os três ajustes visuais revisados nas imagens, além das melhorias de letras presentes na main.

- F01: respostas inválidas da API são barradas antes de atualizar as telas; falhas ficam isoladas por área, com recuperação e preservação dos últimos dados válidos.
- F02: playlists, capas e consultas da fila recebem prazo de 30 segundos. Gravações com resultado incerto exigem conferir o estado antes de repetir, sem duplicação automática de operações.
- F03: o JSON usa a mesma validação na exportação e na restauração, inclui letras e preferências pendentes em memória e preserva dados incompatíveis separadamente, com aviso. O limite de restauração é conferido antes de gerar o arquivo.
- Mini-player: o botão de alternativas fica em uma faixa abaixo do vídeo, sem sobrepor seus controles.
- Player expandido: ferramentas e ajuda permanecem dentro do painel; rolagem interna em janelas menores, menos espaço vazio e menus de playlists acessíveis.
- Biblioteca recente: cartões mais largos, títulos em até duas linhas, ações integradas e colunas adaptadas à largura da janela.
- Letras: busca automática com aproveitamento da duração recebida depois, comparação de gravações e respeito à escolha/importação manual.
- Letras: metadados ausentes tratados corretamente, limites de requisições respeitados e buscas obsoletas canceladas com prazo total controlado no backend.
- Letras: cache offline, ajuste de sincronização por faixa/fonte, tradução agrupada por horário e navegação pelo clique no verso mantidos.

Instalador Windows x64 com assinatura de atualização Tauri. A publicação inclui o manifesto HTTPS utilizado pela central de atualizações do BZtune.

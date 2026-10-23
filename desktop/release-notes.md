BZtune 2.0.10 — player simplificado e correções de estabilidade.

Esta atualização reúne as correções do player expandido, os itens F01 a F10 do frontend e o novo visual simplificado.

- Player expandido: letras integradas ao fundo, menos bordas, capa local inteira e controles de reprodução mais discretos. O rodapé e suas funções foram preservados.
- Downloads continuam sendo acompanhados ao trocar de música ou ferramenta. Baixar a faixa atual não troca a fonte nem reinicia a reprodução em andamento.
- Falhas nas alternativas de vídeo, nos downloads e nas preferências salvas recebem tratamento localizado, sem derrubar a interface.
- Fechar o player informa que a fila será limpa e oferece Desfazer. A fila restaurada fica pausada, evitando reprodução inesperada.
- Teclado: foco contido nos diálogos, retorno ao controle de origem e Escape para fechar menus e seletores antes do player.
- Descoberta descarta respostas antigas para preservar a pesquisa mais recente.
- Biblioteca local dividida em páginas de 50 faixas; áreas secundárias carregam na primeira visita e a biblioteca oculta não renderiza suas linhas.
- Falhas de recomendações, exclusão do histórico e acesso à área de transferência apresentam mensagens e opções de recuperação.
- Favoritos e coleção preservam edições diferentes e nomes de álbuns em outros alfabetos.
- Melhorias de contraste e nomes acessíveis; capas quebradas da fila usam a imagem substituta.

As correções anteriores permanecem incluídas:

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

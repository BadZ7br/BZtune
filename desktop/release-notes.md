BZtune 2.0.9-rc.2 — instalador de teste das melhorias de letras.

- Correção da busca automática: aguarda brevemente a duração e usa busca de versões quando a consulta exata falha.
- Seleção automática exige título/artista compatíveis e duração com diferença máxima de 2 segundos; versões incertas são oferecidas diretamente no painel.
- Metadados recebidos durante a busca são aproveitados, e importação/seleção manual continuam tendo prioridade.
- Álbum ausente não aparece como “null”.
- Relógio vinculado à faixa e à fonte de áudio, com leitura mais frequente quando as letras estão visíveis.
- Ajuste de sincronização em passos de 100 ms, salvo por música e fontes de áudio/letra.
- Parser LRC preserva texto entre colchetes e agrupa original e tradução com o mesmo horário.
- Rolagem reiniciada na troca de música/fonte, adaptável ao tamanho da janela e preservando leitura manual.
- Escolha de gravações no LRCLIB por álbum, duração e tipo de letra, com persistência offline.
- Clique, toque, Enter ou Espaço em um verso para navegar até o trecho, respeitando pausa, ajustes e crossfade.
- Controles agrupados no menu ⋯, com indicação da fonte, fechamento por Esc/clique fora e suporte a teclado.

Compilação de teste: não publica Release oficial nem substitui o feed público de atualização. Inclui as funcionalidades e correções anteriores da main. O layout Dueto permanece um protótipo separado.

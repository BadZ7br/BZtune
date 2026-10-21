# Modelo A — Dueto com rodapé revisado

Prévia solicitada antes de integrar o layout ao player de produção. A tela mantém o modelo Dueto e inclui no rodapé:

- Shuffle, anterior, reprodução/pausa, próxima e Loop.
- Loop com três estados: desligado, repetir fila e repetir uma faixa (ícone com “1”).
- Botão “+” junto do volume, abrindo Adicionar à playlist, Favoritos e Coleção.
- Indicação visual dos modos ativos e das escolhas no menu de adição.

Os arquivos PNG são capturas do protótipo com dados fictícios. O player real não foi alterado. As interações deste HTML demonstram estados e navegação; persistência e serviços serão conectados na integração.

`01-dueto-rodape.png` mostra a tela completa; `02-menu-adicionar.png` mostra o menu do “+” aberto.

Reprodução das capturas: `CHROMIUM_PATH=/usr/bin/chromium node scripts/preview_player_dueto_footer.cjs`. O script verifica os estados de Shuffle e Loop, o menu, seleção de Favoritos/Coleção e acesso à playlist. Sem a variável de ambiente, usa o navegador instalado pelo Playwright.

## Prévia dentro da interface do BZtune

`03-no-frontend-bztune.png` e `04-no-frontend-menu.png` mostram uma composição visual do modelo A com a navegação e o cabeçalho reais do frontend. O player proposto é apresentado em um iframe temporário no navegador de captura; isso ilustra a integração, sem substituir o componente React de produção. Os dados são fictícios e a API é interceptada durante a captura.

Com o Vite em execução, gere essas imagens com `CHROMIUM_PATH=/usr/bin/chromium node scripts/preview_player_in_context.cjs`.

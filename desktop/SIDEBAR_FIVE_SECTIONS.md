# BZtune — Navegação em cinco áreas (etapa 1)

A proposta visual escolhida é a barra lateral preta/verde com cinco entradas
fixas, semelhante à referência aprovada pelo usuário:

- **Início** → tela inicial com os acessos já existentes.
- **Explorar** → **Pesquisa**, **Gêneros**, **Descoberta** e **Recomendações**.
- **Biblioteca** → **Músicas offline**, **Coleção**, **Favoritos** e **Playlists**.
- **Ferramentas** → **Estatísticas** e **Backup e diagnóstico**.
- **Sistema** → central com cartão de **Configurações (próxima etapa)**,
  **Atualizações** (fluxo Tauri existente), atalho para backup e **Sobre**.

Somente cinco botões compõem a navegação principal. As outras funções são
selecionadas em abas **na região de conteúdo**, não em uma lista longa
na lateral. Itens ativos têm contraste verde; a sidebar continua fixa no
desktop e acessível por botão em janelas estreitas.

A central de atualizações permanece funcional: seu único slot DOM é criado
mesmo antes de o usuário abrir Sistema, para que a montagem assíncrona do
JavaScript/Tauri não perca o botão. Quando uma versão nova é encontrada,
aparece um pequeno indicador no botão **Sistema**, sem criar overlay.

## Alterações deliberadamente adiadas

A página de **Configurações** ainda não tem controles funcionais. O cartão
“Próxima etapa” é intencional: temas, áudio, download e inicialização
demandam integração real com preferências persistidas e testes próprios.
Não mostramos switches simulados que poderiam levar o usuário a acreditar
que suas preferências foram alteradas.

## Compatibilidade

Os identificadores internos de tabs, bancos, playlists e localStorage foram
preservados. `doomvault-last-tab` continua a gravar exatamente o mesmo
identificador de rota. Navegações persistidas em versões anteriores continuam
aceitas, e páginas de músicas/artistas abertas por outras áreas continuam
usando o fluxo atual.

Não modifica integração de áudio, backend, downloader, atualizador assinado,
Windows NSIS ou localização física dos arquivos.

## Aceite

1. Testes automatizados de navegação aprovados (cinco itens, rotas e dados
   preservados, atualizador e responsive).
2. Build React/TypeScript, Node updater e NSIS preview verdes.
3. Teste visual no Windows: trocar entre cinco áreas, navegar pelas abas,
   voltar para Home, acessar a central de atualizações em Sistema,
   manter biblioteca e playlists, e usar uma janela pequena.
4. Somente depois, iniciar a etapa independente de Configurações.

**Não publicar Release nesta mudança.**

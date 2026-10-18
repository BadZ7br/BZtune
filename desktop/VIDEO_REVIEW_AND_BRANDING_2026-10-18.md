# Revisão visual do BZtune — vídeo de 18/10/2026 (48 s)

## Evidências do vídeo

Arquivo recebido: `2026-10-18 20-01-47.mp4` (1920×1080, cerca de 48 s).
O vídeo mostra a página do álbum "Dare I Say" de Hermano, reprodução de
"Let's Get It On", player expandido, fila de reprodução e navegação para
"Backup e portabilidade" e pesquisa.

| Tempo | Observação | Gravidade | Resultado |
| --- | --- | --- | --- |
| 0–10 s | Download da faixa "Quite Fucked" mostra erro bruto `yt-dlp` / YouTube exigindo verificação `Sign in to confirm you're not a bot` | Alta, UX do download | Mensagem amigável no `CatalogDownloadButton`; nenhuma tentativa de contornar a verificação |
| 0–10 s | Sidebar ainda exibe `DOOMVAULT` | Média, identidade inconsistente | Marca migrada para `BZtune` |
| 0–35 s | Botão `Atualizações` fixo no canto inferior esquerdo se sobrepõe à lateral; o mesmo problema foi observado na gravação anterior | Alta, CSS/responsividade | Correção no PR #10 integrada à main, pendente de teste no app instalado |
| 12–38 s | Player integrado YouTube toca e exibe título, fila e posição progredindo | Evidência positiva parcial | Reprodução visível, não prova todos os formatos/controles |
| 17–35 s | Área de reprodução ocupa três colunas, fila rolável, controles visíveis em 1920×1080 | Evidência positiva parcial | Exigir reteste em 960×640, escala Windows ampliada e janelas pequenas |
| 38–48 s | Transições entre artista, diagnóstico e pesquisa exibem identidade antiga no menu | Média | Padronização BZtune |

## Mudanças de identidade desta etapa

- `doomvault/index.html`: título e descrição `BZtune`.
- `src/App.tsx`: logotipo textual, rodapé, fallback de capa, componente
  renomeado e versão real consultada via Tauri.
- Home, Artista, Álbum, Playlists, Descoberta, Estatísticas e Backup:
  textos atualizados para BZtune, sem versões v1.x obsoletas.
- Biblioteca: mensagem de falha deixa de mencionar Flask v1.2.2;
  metadados sem rótulo de versão v1.4.1.
- Mensagens de erro da API do frontend: `BZtune`.
- Download automático: mensagem amigável quando o YouTube exige verificação,
  sem instruir o usuário a contornar restrições nem mostrar detalhes brutos.

## Compatibilidade dos dados

**Não renomear** pastas `doomvault`, chaves `doomvault-*` de
`localStorage`, nomes dos eventos internos, tabelas SQLite, rotas da API nem
identificadores de pacote nesta mudança visual. Esses nomes legados são
internos, e uma substituição global poderia perder favoritos, estados do
player e playlists ao atualizar.

## Pendente de validação real

1. Instalar uma compilação de teste BZtune, sem publicar Release.
2. Abrir o app e confirmar `BZtune` em todas as telas, sem rótulos v1.x.
3. Conferir a versão exata no rodapé e no painel de atualizações.
4. Validar a barra de atualizações na lateral com janela pequena e no
   player expandido.
5. Exercitar um download que recebe erro de verificação; confirmar que o
   texto da UI é compreensível e nenhuma orientação para contorno é exibida.
6. Confirmar músicas, playlists, favoritos e histórico preservados.
7. Testar responsividade e navegação por teclado.

**Limite:** esta revisão por gravação é observacional; testes automáticos e
build Windows não demonstram interação real nem equivalência pixel a pixel.
Nenhuma Release oficial está autorizada por esta revisão.

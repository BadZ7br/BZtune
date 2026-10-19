# BZtune — Configurações, personalização e fila de reprodução

## Escopo e segurança
Versão atual de produção: **2.0.4**. Esta alteração permanece em branch isolada;
nenhuma Release pública, instalador ou arquivo pessoal foi alterado.

## Personalização implementada
Em Sistema → Configurações, seis categorias: Geral, Interface, Reprodução,
Downloads, Atualizações, Dados. Em Interface: temas escuro, meia-noite, claro,
sistema; dez cores de destaque e seletor personalizado validado como hexadecimal;
densidade compacta/normal/espaçosa; fonte pequena/média/grande; cantos
discretos/arredondados/bem arredondados; controles independentes de
transparência, movimento, sombras, brilho da sidebar e realce de foco.
As preferências são persistidas em \`bztune-settings-v1\`, isoladas do
localStorage legado das playlists, biblioteca e player. A opção
Redefinir aparência mantém preferências de inicialização.

Em Geral: página inicial preferida e verificação de updates automática.
Em Reprodução: volume, shuffle, repetição e crossfade real com atualização
do player em tempo de execução. Em Downloads e Dados: botões que abrem
os módulos existentes, sem falsos controles para recursos ainda não
suportados. Em Atualizações: mantém o mesmo slot único e assinatura Tauri.

## Fila
O sistema já possuía \`addToQueue\` e controles de reordenação/remover.
Adicionada ação **Tocar a seguir**, disponível junto de **Adicionar à fila**
em Início, álbum, busca, playlists e Descoberta. Inserção imediata
reaproveita duplicatas existentes e preserva faixa atual, histórico e
índices do shuffle. Não inicia autoplay ao criar uma fila vazia.
A fila expandida permanece rolável sem scroll global.

## Proteções e testes
- Teste de comportamento Node das operações da fila com TypeScript compilado,
  cobrindo duplicatas, mudança de posição, fila vazia, fontes diferentes.
- Testes Python da integração React/CSS, persistência, preferências válidas,
  updates automáticos, acessibilidade, largura móvel e preservação da biblioteca.
- Suíte existente do player, CSS e atualizador.
- Build React + TypeScript + Vite e preview NSIS Windows, sem Release pública.
- Verificações antigas de CSS \`!important\` não podem aumentar.

## Limitações explícitas
Nenhum CI substitui teste visual em WebView2 no computador do usuário. A página
pode conter estilos legados com cores explícitas. Os controles principais e
a tela de configurações recebem tokens dos novos temas; a aparência completa
de todas as subpáginas (especialmente tema claro e telas pequenas) precisará
de teste manual com imagens. Os temas não aplicam filtros a capas de álbuns.

Qualidade de download, dispositivo de saída e inicialização nativa com Windows
não são falsamente anunciados como funcionais: exigem implementação separada.

## Checklist Windows pós-build
1. Confirmar sidebar e Configurações sem sobreposição a 1920×1080,
   1280×720 e janela de aproximadamente 960×640.
2. Testar claro, escuro, meia-noite e modo sistema; trocar cor, fonte e densidade.
3. Reiniciar e confirmar que as preferências foram mantidas.
4. Testar botões Tocar a seguir e Adicionar ao fim com músicas locais/online.
5. Confirmar fila, shuffle, repeat, crossfade, player expandido e mini-player.
6. Confirmar pasta de downloads, biblioteca, playlists e backup preservados.
7. Testar central de atualizações pelo botão interno de Configurações.
8. Confirmar renderização no Windows com escala 100%, 125% e 150%.

Só depois dessas verificações propor publicação de nova Release estável.

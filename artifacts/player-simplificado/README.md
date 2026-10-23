# Player expandido simplificado — 23/10/2026

Capturas reais do frontend compilado, em Chromium, com música, letra, capa e APIs de demonstração. Não são imagens geradas nem capturas do aplicativo instalado no Windows.

## Alteração

- Letra, ferramentas e fila passam a compartilhar o fundo do player, sem caixas externas.
- Controles secundários ficam sem contorno; tocar/pausar mantém o destaque da cor escolhida.
- Capa local quadrada, inteira, limitada pelo espaço disponível; vídeo online continua em 16:9.
- Coluna da música com largura contida e alinhamento vertical equilibrado.
- Avisos, controles e opções continuam disponíveis; menus abertos mantêm superfície própria para leitura.
- Rodapé preservado. A comparação das capturas antes/depois em 1360 e 390 px confirmou HTML, posição, tamanho e propriedades visuais iguais.

## Capturas PNG

| Tela | Antes | Depois |
| --- | --- | --- |
| Letra, 1360 × 870 | [Antes](antes-letra-1360.png) | [Depois](depois-letra-1360.png) |
| Equalizador | [Antes](antes-equalizador.png) | [Depois](depois-equalizador.png) |
| Letra e fila | [Antes](antes-fila.png) | [Depois](depois-fila.png) |
| Janela estreita, tema claro | [Antes](antes-letra-390.png) | [Depois](depois-letra-390.png) |

## Verificação

- Build TypeScript/Vite aprovado.
- Layout em nove cenários, incluindo títulos longos, áudio local, fonte grande e larguras entre 320 e 1920 px.
- Ferramentas: ordem do rodapé, playlists, favoritos/coleção, permanência do elemento de vídeo e download em segundo plano.
- Teclado: Escape, fechar seletores e devolver foco, em reprodução local e online.
- Recuperação online: ações clicáveis em oito cenários, sem sobreposição dos controles.
- axe WCAG: vinte cenários do frontend sem violações detectadas nas regras executadas.
- Doze testes Python existentes de consistência CSS e limites/avisos do player aprovados.

As APIs externas de mídia são simuladas nesses testes. O arquivo WAV silencioso dos exemplos é servido localmente. A aparência no Windows/WebView2 ainda requer conferência no aplicativo instalado. Alteração local, sem publicação de atualização.

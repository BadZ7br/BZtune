# Aceite da versão desktop instalada no Windows

Executar em instalação de teste com cópia verificável da biblioteca. Este roteiro foi preparado em Linux; **nenhum item abaixo foi marcado como aprovado em Windows nesta sessão**.

Registrar versão/build, Windows/WebView2, origem do instalador, resultado esperado/observado e eventual erro. Não incluir caminhos privados ou músicas no relatório público.

1. Abrir pelo atalho: janela aparece, serviço inicia e porta ocupada produz orientação. Fechar/reabrir sem deixar sidecar órfão.
2. Importar MP3/FLAC com tags e capa; repetir arquivo sem duplicação; rejeitar arquivo inválido. Conferir edição e créditos individuais.
3. Reproduzir, pausar, buscar, alterar volume/mute, avançar/voltar, shuffle, três estados de loop. Validar fila após reabrir e desfazer limpeza.
4. Alternar player mini/expandido e todas as opções do rodapé; testar teclado, Tab/Escape, zoom e janela mínima. Confirmar equalizador e crossfade com áudio real.
5. Tocar catálogo YouTube, simular indisponibilidade e usar recuperação sem escolher outra edição automaticamente. Confirmar origem local após download.
6. Abrir letras automaticamente; testar LRC, versões LRCLIB, ajuste ±100 ms, seek por verso, troca rápida de faixa e restauração sem rede.
7. Criar/renomear/reordenar playlist mista, adicionar/remover faixas e capa; reabrir; validar preservação dos arquivos.
8. Alterar favoritos, coleção, temas, fontes, densidade e efeitos; reabrir. Conferir identidade de edições e nomes Unicode.
9. Executar download e testar perda de rede e permissão de gravação. Conferir arquivo decodificável, repetição explícita e reconciliação após exclusão.
10. Conferir histórico e tempo de escuta: pausa não contabiliza. Navegar por Início, busca, gêneros, artista, álbum, biblioteca e ferramentas.
11. Exportar/importar JSON; exportar ZIP, inspecionar e restaurar em biblioteca de teste. Conferir contagens, arquivos, hashes e playlist antes/depois. Não interromper restauração para simular timeout sem ambiente descartável.
12. Executar diagnóstico rápido/aprofundado e exportar relatório; confirmar privacidade e rascunho de issue. Não publicar a issue sem revisar.
13. Instalar atualização assinada sobre versão anterior de teste: conferir versão, assinatura, reinício, dados, atalhos e ausência de processos órfãos. Testar erro de rede/assinatura em ambiente isolado.

A execução automatizada pode anexar build/testes/PNGs. Ela não substitui este aceite de áudio, sidecar, NSIS, locks do Windows ou atualização real.

## Pendência de restauração longa (M12)

O fluxo nativo aguarda `command.output().await` antes de recuperar o serviço. Falta prazo explícito. Não foi introduzido encerramento automático: matar uma restauração durante a troca de arquivos pode piorar a situação.

Próxima implementação deve distinguir validação/cópia/troca/conclusão, usar journal recuperável e testar processo travado antes e depois do commit, incluindo reinício e preservação do backup anterior. Só então definir cancelamento/recuperação por fase. Estado: inspeção concluída; travamento e recuperação automática ainda não validados.

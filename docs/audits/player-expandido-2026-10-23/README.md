# Evidências da auditoria do player expandido

Fonte: BZtune main, commit f740d43, 23/10/2026. Estes arquivos documentam a análise; não alteram o funcionamento do aplicativo.

Os probes usam dados sintéticos, Chromium local e o servidor Vite em http://127.0.0.1:5173. As rotas de API do navegador são interceptadas. O probe Python usa o Flask real, com criação das threads de download substituída por mock: nenhum download externo é iniciado.

Os scripts capturados contêm caminhos absolutos do ambiente /workspace/BZtune e saídas em /tmp. Ajuste esses caminhos se for reproduzir fora deste ambiente. Exigem as dependências já instaladas, Playwright e /usr/bin/chromium. Com o frontend compilado e o preview ativo, execute os arquivos .cjs com Node e backend-probes.py com o ambiente Python do projeto.

frontend-probes.json inclui uma tentativa de clicar no botão de alternativas impedida pela sobreposição. Essa tentativa expira; recovery-probes.cjs registra o elemento que intercepta o clique e aciona o botão pelo teclado para testar separadamente o contrato da resposta. A expiração não é contabilizada como teste aprovado.

As imagens são capturas reais do frontend compilado com faixa de teste, YouTube simulado e APIs interceptadas. Não representam uma reprodução real do YouTube nem uma captura do aplicativo Windows instalado.

O probe source-transition usa áudio WAV silencioso real no Chromium e tempo do YouTube simulado. O fechamento do player parou esse áudio no teste, mas também esvaziou a fila, conforme source-transition.json.

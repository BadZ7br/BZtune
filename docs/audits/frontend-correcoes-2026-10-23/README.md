# Evidências da conclusão F01–F10

Verificação de 23/10/2026 sobre main f740d43 com as correções locais do player e do frontend. Dados musicais sintéticos e APIs interceptadas; não houve modificação de músicas pessoais nem publicação de release.

`release-checks.log`: 202 testes Python aprovados, um exclusivo de Windows ignorado e 115 testes JavaScript aprovados. `browser-suites.log`: 23 suítes aprovadas. `accessibility-after.json`: 20 cenários sem violações das regras WCAG executadas pelo axe-core 4.14.0; `accessibility-before.json` registra as violações reproduzidas antes de F09. Os logs específicos incluem paginação com 1.500 músicas, foco, falha parcial/total das recomendações e miniaturas 404.

Os testes de navegador usam Chromium no Linux e um adaptador do YouTube. As regressões do player também usam áudio WAV silencioso real. Essas verificações não substituem execução do aplicativo Windows instalado nem teste humano com leitor de tela.

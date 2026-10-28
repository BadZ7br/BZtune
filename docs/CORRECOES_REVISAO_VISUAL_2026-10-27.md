# Correções da revisão visual — 27/10/2026

Correções V01–V10 aplicadas sequencialmente. O relatório visual original permanece como registro anterior. Publicação e instalador não fazem parte desta etapa.

## V01 — concluído

O detector valida o relatório completo, incluindo resumo, grupos e faixas, antes de atualizar o estado. Respostas parciais geram erro no próprio painel e mantêm o último relatório válido. Cinco testes de contratos, build e regressão no navegador com falha/recuperação/último resultado aprovados.

## V02 — concluído

Diagnóstico tem estado próprio de carregamento/erro, limpa o erro após sucesso e preserva os últimos dados com aviso quando a nova consulta falha. Erros de importação/backup não são apagados pela consulta do diagnóstico. Build e regressão de falha, recuperação e isolamento de erros aprovados.

## V03 — concluído

Atualização de transferências valida a resposta e informa falhas de rede/dados, mantendo os últimos trabalhos conhecidos. O estado vazio só aparece depois de uma consulta válida. Erros de envio e de consulta ficam separados, e o aviso de consulta desaparece após recuperação. Contratos, build e fluxo offline/resposta inválida/conclusão aprovados.

## V04 — concluído (28/10)

O card da Home encaminha o ID da playlist e abre a lista escolhida. Novos cliques explícitos substituem a seleção anterior, inclusive ao voltar à mesma playlist após uma escolha manual. O formulário da lista anterior é limpo ao trocar por esse atalho. Build e regressão de navegação repetida aprovados.

## V05 — concluído (28/10)

Os cards de Coleção, Favoritos e Recomendações encaminham o ID do lançamento ao download. Teste com duas edições de mesmo artista/título confirmou pedidos independentes e IDs corretos nas três abas. Build aprovado.

## V06 — concluído (28/10)

Home, menu das faixas recentes, busca de letras e seletor de playlist local usam nomes acessíveis que incluem o texto visível. O contexto da música permanece no nome quando necessário. Layout/rodapé preservados. Verificação axe nos quatro componentes, navegação de teclado online/local e build aprovados; seletores das regressões foram atualizados para os novos nomes.

## V07 — concluído (28/10)

O histórico das estatísticas é uma região nomeada e alcançável por Tab, com indicador de foco já compartilhado pelo aplicativo. PageDown rola a lista e Tab permite sair normalmente. Teste com 30 registros nos três temas/larguras e regra axe de região rolável aprovados; build aprovado.

## V08 — concluído (28/10)

Identificadores dos perfis homônimos usam a cor secundária do tema sem a opacidade que reduzia o contraste. Verificação de contraste axe aprovada nos cinco filtros da discografia em três temas/larguras; build aprovado.

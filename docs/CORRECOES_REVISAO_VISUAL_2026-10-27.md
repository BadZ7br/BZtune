# Correções da revisão visual — 27–28/10/2026

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

## V09 — concluído (28/10)

Cards do catálogo, pesquisa, artista e renderizador de gêneros expõem aria-pressed e o nome do álbum nos controles de Favoritos/Coleção. A seleção visual e os IDs armazenados permanecem iguais. Regressão de remover/repor em Coleção, Favoritos, Recomendações, Pesquisa e Artista aprovada; build aprovado.

## V10 — concluído (28/10)

Arte de faixas recentes, playlists e álbuns da Home usa o mesmo componente de fallback visível e acessível. O SafeArtwork existente delega a renderização a esse componente, mantendo sua política de URLs/proxy. URLs locais permanecem resolvidas pelos consumidores. Teste de 404 nos três tipos de card, ausência de novas requisições por mudança de volume e recuperação ao recarregar a Home aprovado. Layout/menu das faixas recentes passou em nove combinações de largura/tema/aparência; build aprovado.

### Complemento de validação de V01/V03

A revisão integrada reforçou os campos discriminadores: tipo de duplicata e status de transferência precisam ser strings válidas, sem aceitar arrays/objetos por coerção. Regressões adicionais verificam a preservação dos últimos dados nessas respostas malformadas.


## Verificação final — 28/10/2026

Após o complemento de validação, o build final foi verificado com as suítes completas:

| Verificação | Resultado |
| --- | --- |
| Python | 223 coletados: 222 aprovados, 1 exclusivo do Windows ignorado |
| JavaScript | 124 aprovados |
| Navegador | 30 suítes aprovadas, incluindo regressões de V01 a V10 |
| Frontend | TypeScript e build Vite aprovados |
| Estrutura/sintaxe | Verificação estrutural/Python, sintaxe do atualizador e diff sem erros |

[Resultado estruturado](audits/correcoes-visuais-2026-10-28/resultado.json), [Python/JavaScript](audits/correcoes-visuais-2026-10-28/python-javascript.log), [navegador](audits/correcoes-visuais-2026-10-28/navegador.log) e [build](audits/correcoes-visuais-2026-10-28/build.log).

As verificações incluem retomada do último resultado válido, repetição do mesmo atalho de playlist após seleção manual, duas edições homônimas nas três abas, nomes acessíveis, contraste em cinco filtros/três temas, teclado e falhas de imagem sem repetição por rerender.

Capturas posteriores às correções, usando dados sintéticos e adaptador do YouTube simulado: [Início](audits/correcoes-visuais-2026-10-28/capturas/01-inicio.png), [erro localizado em duplicatas](audits/correcoes-visuais-2026-10-28/capturas/02-duplicatas-erro-local.png), [perfis no tema claro](audits/correcoes-visuais-2026-10-28/capturas/03-perfis-contraste.png) e [histórico com foco de teclado](audits/correcoes-visuais-2026-10-28/capturas/04-historico-teclado.png). O retângulo preto do vídeo pertence à simulação e não comprova falha do YouTube real.

Instalação/atualização real em Windows e chamadas reais aos provedores externos continuam sem validação neste ambiente Linux. Acessibilidade automatizada não substitui teste humano com leitor de tela.

V01–V10 foram corrigidos em commits locais, com um complemento dos contratos e regressões adicionais. Não houve disparo de workflow nem publicação de atualização nesta etapa. As cinco sugestões de redesign do relatório anterior permanecem como recomendações separadas; o rodapé do player foi preservado.

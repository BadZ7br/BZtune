# Correções da revisão visual — 27/10/2026

Correções V01–V10 aplicadas sequencialmente. O relatório visual original permanece como registro anterior. Publicação e instalador não fazem parte desta etapa.

## V01 — concluído

O detector valida o relatório completo, incluindo resumo, grupos e faixas, antes de atualizar o estado. Respostas parciais geram erro no próprio painel e mantêm o último relatório válido. Cinco testes de contratos, build e regressão no navegador com falha/recuperação/último resultado aprovados.

## V02 — concluído

Diagnóstico tem estado próprio de carregamento/erro, limpa o erro após sucesso e preserva os últimos dados com aviso quando a nova consulta falha. Erros de importação/backup não são apagados pela consulta do diagnóstico. Build e regressão de falha, recuperação e isolamento de erros aprovados.

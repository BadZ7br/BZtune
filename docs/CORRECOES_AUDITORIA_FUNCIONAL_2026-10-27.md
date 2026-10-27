# Correções da auditoria funcional — 27/10/2026

Aplicação sequencial dos itens A01–A16. O relatório original permanece como registro anterior às correções. Nenhuma nova atualização foi publicada durante este trabalho.

## A01 — concluído

- Referências de capas limitadas a nomes de imagem diretamente dentro da pasta autorizada. Caminhos absolutos, separadores, drives, controles e links simbólicos recusados.
- Leitura, substituição e exclusão de capa e exclusão da playlist usam a mesma validação.
- Inspeção do SQLite de backup rejeita referências de capa inseguras; a restauração reutiliza essa inspeção.
- Quatro regressões de segurança e os testes de consistência do backup aprovados. Troca normal de capa continua funcionando; sentinelas temporárias são preservadas.

## A02 — concluído

Normalização compartilhada preserva alfabetos e marcas não latinas. Chaves vazias não comprovam cópia local; IDs de origem continuam prioritários. Artistas, cópias locais e duplicatas usam as regras corrigidas. IDs de álbuns existentes são preservados ao encontrar chaves antigas. Regressões Unicode, metadados e build aprovados.

## A03 — concluído

Importações/downloads só reutilizam uma faixa quando há hash ou ID de origem comprovado. Coincidências de título/artista ficam para revisão no detector. Regressão de versões distintas e fluxos de biblioteca/playlists aprovados.

## A04 — concluído

Fila, volume e preferências do player passam pelo armazenamento com estado pendente. Falhas mostram aviso, o backup inclui a fila atual e Tentar salvar novamente grava o estado mais recente. Regressão de quota/exportação/retry e build aprovados.

## A05 — concluído

A faixa guarda o ID do lançamento de catálogo. Favoritos/coleção resolvem esse ID mesmo após navegar/reabrir; sem ID, nomes ambíguos não são escolhidos automaticamente. Metadados do álbum aberto ficam no catálogo conhecido. Regressão de duas edições, navegação e recarga aprovada.

## A06 — concluído

Restauração e contrato de backup deixam de truncar/rejeitar a fila apenas por passar de 500 entradas. O limite total de 10 MiB do arquivo de backup permanece. Regressão de fila com 501 entradas após recarga, quota e testes de exportação aprovados.

## A07 — concluído

O carregamento de faixas recentes e a conversão de faixa local preservam o álbum. Reprodução pela Home mantém o contexto e permite as ações de álbum quando há identificação única. Testes de dados recentes, navegação/edições e fluxo Home aprovados.

## A08 — concluído

Lote inexistente encerra o polling e libera nova tentativa explícita. Eventos de edição/exclusão da biblioteca reconciliam conclusões anteriores; a conclusão do próprio download não perde seu aviso/estado. Arquivos ainda comprovados por ID preservam conclusão. Regressões do gerenciador, arquivo excluído e HTTP 404 aprovadas; nenhuma nova transferência é iniciada pela reconciliação.

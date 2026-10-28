BZtune 2.0.11 — integridade da biblioteca e correções de interface.

- Corrige as pendências A01–A16 e V01–V10, mantendo as funções e o rodapé do player.
- Protege referências de capas e restauração de backups; preserva identidades Unicode e edições distintas.
- Mantém a fila completa ao reabrir e inclui alterações pendentes no backup, com aviso de armazenamento.
- Importação aproveita metadados embutidos e valida áudio real; downloads validam o arquivo completo.
- Recupera consultas de downloads, diagnóstico e duplicatas sem perder o último resultado válido.
- Cards da Home abrem a playlist escolhida; downloads dos álbuns preservam o ID da edição.
- Corrige créditos individuais em coletâneas e contabilização de escuta com timers atrasados.
- Melhora nomes acessíveis, contraste dos perfis, navegação por teclado e placeholders das capas.
- Exportação CSV trata metadados como texto; APIs rejeitam envelopes JSON inválidos.

Validação local: 222 testes Python aprovados (1 exclusivo de Windows ignorado), 124 testes JavaScript e 30 suítes de navegador aprovadas. A publicação exige os checks do workflow Windows, assinatura e validação do pacote. Instalação/atualização real no Windows continua pendente de aceitação.

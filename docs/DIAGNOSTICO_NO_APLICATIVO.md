# Verificação no aplicativo

Em **Backup e diagnóstico → Verificação do BZtune**, execute a verificação.
Cada consulta tem prazo de oito segundos e a execução pode ser cancelada.
A verificação não faz gravações na biblioteca, downloads ou testes de reprodução.

## Cobertura inicial

- Contratos das respostas de músicas, álbuns, playlists e histórico.
- Diagnóstico existente do backend: integridade rápida SQLite e presença de dependências.
- Permissão de leitura do armazenamento da interface.

Um resultado OK comprova somente a verificação descrita, não toda a funcionalidade.
Reprodução, áudio, letras, provedores externos, atualização, gravação de configurações,
restauração e interação visual são explicitamente indicados como não testados.
Não se executa a suíte de desenvolvimento na biblioteca real do usuário.

## Relatório e GitHub

O relatório usa uma lista explícita de fatos técnicos: resultados, versão e data UTC.
Não inclui corpos das respostas, mensagens de exceção, caminhos, títulos de músicas,
conteúdo de configurações ou tokens. Pode ser baixado em Markdown.

**Revisar issue no GitHub** abre exclusivamente o formulário de issue do repositório
BadZ7br/BZtune, com o relatório preenchido. A publicação ocorre pela conta do usuário,
no próprio GitHub. O aplicativo não armazena token GitHub e não publica silenciosamente.
No desktop, um comando Rust restrito a esse formulário abre o navegador padrão.

## Validação desta implementação

- TypeScript e build Vite aprovados.
- Teste de navegador: sucesso, falha parcial com payload inválido, privacidade,
  exportação e URL/conteúdo da issue aprovados.
- Seis testes de contratos existentes aprovados.
- `cargo check --locked --offline` bloqueado por ausência de GLib/GObject de
  desenvolvimento no ambiente Linux. A abertura nativa ainda precisa de validação
  no build desktop/Windows; não há nova versão publicada nesta etapa.

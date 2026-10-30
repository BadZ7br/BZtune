# Verificação no aplicativo

Em **Backup e diagnóstico → Verificação do BZtune**, escolha o modo e execute.
As consultas locais têm prazo de oito segundos; as aprofundadas, doze segundos por
etapa; os comandos nativos de identificação têm quatro segundos. É possível cancelar.
Cancelar interrompe as próximas etapas e a espera do frontend; uma operação do backend
já iniciada pode terminar dentro do seu próprio prazo, sem publicar relatório parcial.

## Cobertura

### Rápida

- Contratos das respostas de músicas, álbuns, playlists e histórico.
- Diagnóstico existente: integridade rápida SQLite e presença de dependências.
- Leitura e gravação em chave temporária do navegador, removida ao terminar.
- Pendências de gravação da sessão e compatibilidade das preferências/fila salva
  com o contrato usado na restauração de configurações. Não reproduz a fila.
- No desktop, consulta de habilitação do atualizador, sem iniciar atualização.
- Até 20 falhas recentes de requisições via apiFetch, dos últimos 15 minutos desta
  sessão. Apenas códigos HTTP ou indicação de falha de conexão; sem URLs, corpos,
  mensagens de exceção ou persistência. Não captura todos os erros do programa.

### Aprofundada

Inclui o modo rápido e:

- Contato HTTP com LRCLIB (consulta sintética), YouTube Music e releases do GitHub.
  Sem metadados de músicas, credenciais ou cookies do usuário. Mede tempo até os
  cabeçalhos, não baixa o corpo nem segue redirecionamentos. Não comprova busca,
  reprodução, conteúdo da resposta, assinatura ou instalação da atualização.
- Amostra determinística de até 100 referências de músicas: existência, abertura,
  tamanho esperado e caminhos restritos à pasta de áudio. Banco aberto somente
  para leitura; não cria banco ausente. Informa quando existem arquivos não examinados.
- Execução de `ffmpeg -version` e `ffprobe -version` com prazo individual de três
  segundos, sem registrar saída ou caminhos dos executáveis.
- Espaço disponível e gravação/leitura/remoção de arquivo temporário na pasta de
  áudio. Não substitui músicas nem grava metadados. Menos de 1 GiB livre gera aviso,
  não uma estimativa garantida de quantos downloads cabem.

## Limites explícitos

Um resultado aprovado comprova somente a verificação descrita. Reprodução real,
decodificação completa, capas, download completo, letras, assinatura de atualização,
backup completo/restauração e interação visual permanecem não testados.
Não se executa a suíte de desenvolvimento na biblioteca real do usuário.
Não há reparos automáticos. A análise de letras fica para uma etapa separada.

## Resultados e GitHub

A tela apresenta estados individuais, resumo, repetição e comparação com a última
verificação concluída nesta sessão. A comparação considera mudanças de estado em
verificações com o mesmo nome; não persiste relatórios entre sessões.

O relatório usa fatos técnicos selecionados e não inclui caminhos, títulos, corpos
de respostas, configurações ou tokens. O campo opcional de descrição é fornecido
pelo usuário, aparece na prévia e será público se a issue for publicada.

**Revisar issue no GitHub** abre o formulário do repositório BadZ7br/BZtune com o texto
preenchido. A publicação ocorre pela conta do usuário no GitHub. Sem token no BZtune
ou publicação silenciosa. Relatórios extensos devem ser baixados e anexados manualmente.
No desktop, um comando Rust restrito a esse formulário abre o navegador padrão.

## Validação

Testes de unidade cobrem rede simulada, falhas sem vazamento, banco ausente, arquivos
inconsistentes, limite da amostra, preservação dos arquivos e remoção do temporário.
Teste de navegador cobre os dois modos, falha parcial, cancelamento, comparação,
fila salva inválida, exportação, descrição e formulário da issue.

A abertura nativa ainda requer execução no Windows. `cargo check` local foi bloqueado
pela ausência de GLib/GObject de desenvolvimento no Linux. Os testes de conectividade
usam simulações controladas; não comprovam disponibilidade atual dos provedores.
Nenhuma atualização foi publicada nesta etapa.

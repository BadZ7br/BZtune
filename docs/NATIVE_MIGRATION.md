# Migração do núcleo local para Tauri/Rust

## Objetivo

Eliminar gradualmente o servidor Flask local e o executável Python, preservando a interface e os dados existentes. O destino é uma interface React que chama serviços internos do Tauri, com implementações de armazenamento e reprodução adequadas a cada plataforma.

## Etapa 1: operações de playlists

`desktop/native-core` é uma biblioteca Rust independente de Tauri, HTTP e Python. Ela acessa o SQLite existente e implementa listagem, criação, edição e exclusão de playlists; inclusão de faixas locais/online, inclusão em lote, remoção de entradas e ordenação.

O comando `native_playlists` em `desktop/src-tauri/src/native_playlists.rs` executa o serviço fora da thread de interface. A WebView fornece ações e identificadores, nunca um caminho de banco. `doomvault/src/services/playlists.ts` concentra os contratos e a escolha do transporte. No Tauri, chama IPC; no navegador de desenvolvimento, mantém a API existente. Erros de comandos nativos nunca provocam uma segunda tentativa HTTP de escrita.

As três interfaces consumidoras — página de playlists, botão de adicionar músicas online e botão de adicionar músicas locais — usam o mesmo serviço. A falha do serviço de biblioteca não descarta a listagem nativa já carregada.

## Compatibilidade e dados

- Windows instalado: mantém `%LOCALAPPDATA%/BZtune/library/library.sqlite3`.
- Desenvolvimento desktop: compartilha `doomvault-api/doomvault_library/library.sqlite3` com o backend atual.
- `BZTUNE_LIBRARY_DIR`: substitui a pasta do serviço nativo e do launcher Python de produção. Se iniciar `app.py` manualmente em desenvolvimento, ele continua usando seu caminho original; ambos devem apontar para a mesma biblioteca.
- Os IDs, nomes de tabelas, relacionamentos, formato de resposta e marcador `mixed_playlists_v1` são preservados. A migração antiga ocorre uma única vez; músicas removidas não reaparecem.
- Escritas são transacionais, com foreign keys e espera de até cinco segundos por bloqueios do SQLite. A criação de esquema também é serializada com outras escritas.
- Excluir uma playlist remove suas entradas, não seus arquivos de áudio. A limpeza da capa fica restrita a um nome de arquivo dentro de `playlist_covers`.
- Não houve conversão nem teste sobre dados pessoais: os testes de compatibilidade usam diretórios temporários.

O formato de resposta ainda contém URLs locais de áudio e capas. A resolução automática por título/artista foi preservada nesta etapa para não misturar migração arquitetural com mudança de identidade musical.

## O que ainda depende do Python

Importação e reprodução de áudio local, envio/leitura de capas, biblioteca e edição de metadados, descoberta/catálogo, downloads/conversão, estatísticas e backup/restauração. O launcher continua iniciando o sidecar enquanto essas dependências existirem. Esta etapa não produz um aplicativo inteiro independente do Flask nem configura Android.

## Verificação

Com Rust/Cargo disponível, a partir da raiz:

```sh
cargo test --locked --manifest-path desktop/native-core/Cargo.toml
cargo clippy --locked --manifest-path desktop/native-core/Cargo.toml --all-targets -- -D warnings
cargo build --locked --manifest-path desktop/native-core/Cargo.toml --example playlist_service
python scripts/check_native_playlists.py desktop/native-core/target/debug/examples/playlist_service
node --test tests/native-playlists.test.mjs tests/desktop-updates.test.mjs tests/queue-behavior.test.mjs
```

No Windows, o exemplo termina em `.exe`. O Python usado pela verificação precisa das dependências de `doomvault-api/requirements.txt`. A verificação escreve com Python, lê/altera com Rust e volta a comparar os resultados com as rotas Python no mesmo banco temporário, conferindo também duplicatas, ordem e preservação de áudio.

Frontend: em `doomvault`, `npm ci` e `npm run build`. Para executar a suíte Python existente, encerre o Flask que você iniciou antes do teste de restauração: ele exige a porta 5000 livre. O teste que mantém um arquivo aberto e espera bloqueio nativo de Windows já falha no Linux; a simulação explícita de bloqueio Windows é independente dessa limitação.

O workflow `native-core.yml` valida Rust, transporte e interoperabilidade em Linux e Windows. No Windows, também prepara os recursos existentes e executa `cargo check` no aplicativo Tauri. Isso é compilação, não validação do instalador ou da interface em execução. O workflow precisa ser enviado ao GitHub para executar.

## Próximas etapas

1. Validar a integração em uma compilação Windows com uma cópia da biblioteca, inclusive ordenação e mudanças simultâneas de metadados.
2. Migrar arquivos de áudio e capas para acesso nativo e retirar URLs de loopback das playlists/player.
3. Migrar biblioteca, metadados e backup/restauração, mantendo o formato e as migrações do SQLite compatíveis.
4. Separar provedores de catálogo e downloads e definir quais componentes substituem as dependências Python.
5. Retirar o sidecar e as verificações HTTP quando todos os consumidores tiverem migrado; atualizar o instalador e a documentação nesse ponto.
6. Preparar a prova Android com armazenamento local e reprodução em segundo plano, usando os serviços compartilhados onde forem compatíveis.

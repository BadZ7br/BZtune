# BZtune Desktop 2.0.13 — publicação verificada

Publicado após aprovação do Preview pelo usuário. Fonte: `31a684191887269f06bd46ce765cde912b2ff1cc`, tag `v2.0.13` conferida no remoto.

- Release: https://github.com/BadZ7br/BZtune/releases/tag/v2.0.13
- CI final: https://github.com/BadZ7br/BZtune/actions/runs/43662767910 — sucesso.
- Instalador: https://github.com/BadZ7br/BZtune/releases/download/v2.0.13/BZtune-Setup-v2.0.13-x64.exe
- Feed do aplicativo: https://github.com/BadZ7br/BZtune/releases/latest/download/latest.json

Suíte local: 256 casos Python, um ignorado, sem falhas; 128 JavaScript e build aprovados. No Windows, passaram aplicação, 31 suítes de navegador, interoperabilidade Rust/Python, empacotamento, compilação, assinatura e validação criptográfica de pacote/feed.

A primeira tentativa 43662363785 foi bloqueada pelo teste de escuta que somava tempo real do runner aos 420 segundos simulados. O relógio da fixture passou a ser totalmente controlado e a asserção exige 420 segundos exatos, inclusive após espera real de 2,2 segundos. O código de contagem do aplicativo não foi modificado. A execução final completa passou.

Verificação externa após publicação: feed informa 2.0.13; assinatura publicada coincide com a do feed; identificador da chave coincide com a assinatura anterior 2.0.12. A validação criptográfica completa foi feita pelo workflow. Instalador público baixado integralmente, cabeçalho PE verificado, 90.152.696 bytes. SHA-256 calculado do download:

`b099f449719818432a58169cab15334ef0910b3f17e554ff8f9d21ff1364824d`

A publicação usa identificador e biblioteca do aplicativo principal, sem o modo isolado do Preview. Sistema → Atualizações permite consultar a nova versão. A efetiva atualização no computador do usuário não foi executada pelo agente.

O workflow Android preserva uma release já existente em vez de tentar republicar a mesma versão. Nenhuma nova versão Android foi solicitada nesta publicação.

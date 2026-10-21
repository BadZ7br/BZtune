Letras com LRCLIB e correções de confiabilidade do player.

- Busca de letras pelo LRCLIB na aba Letra, com suporte a letras sincronizadas, texto simples e indicação de faixa instrumental.
- Letras encontradas salvas neste aparelho e incluídas no backup JSON de configurações.
- Arquivos LRC importados preservados: escolha entre a letra manual e a letra do LRCLIB salvo.
- Importações e buscas respeitam a última ação iniciada; respostas antigas não substituem a letra após a troca de música.
- A duração enviada na busca pertence à faixa atual e só é utilizada quando confirmada pelo player.
- Arquivos LRC inválidos e falhas de conexão preservam a letra anterior; suporte a offset e validação dos timestamps.
- Limite de leitura da resposta do LRCLIB antes da interpretação do JSON.

A biblioteca, as playlists e as preferências existentes são preservadas. A consulta envia apenas título, artista, álbum e duração quando disponível; não envia arquivos de áudio. A disponibilidade e a correspondência das letras dependem do LRCLIB.

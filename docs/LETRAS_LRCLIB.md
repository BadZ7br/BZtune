# Letras com LRCLIB

No player, abra **Letra → Buscar no LRCLIB**. A consulta é manual e envia título, artista, álbum (se disponível) e duração (quando conhecida e entre 1 e 3600 segundos). Não exige conta ou chave de API. Não faz upload de áudio.

A duração só é enviada quando pertence à faixa atual e o player está pronto. Importações e buscas compartilham cancelamento, de modo que a última operação iniciada prevalece.

O backend consulta `GET https://lrclib.net/api/get`, por meio de `GET /api/lyrics`, com timeout, destino fixo e limite de 1 MiB dos bytes descomprimidos recebidos, verificado antes de interpretar o JSON. Cada campo de letra tem limite de 250 KB. Não utiliza busca aproximada como fallback: uma gravação sem correspondência pode retornar sem resultado. Metadados incorretos podem impedir a localização da letra.

O player prioriza a letra sincronizada; se houver apenas texto simples, exibe sem destaque temporal. Faixas instrumentais recebem uma indicação. Erros e ausência de resultado preservam a letra já exibida. Trocar a faixa cancela a busca na interface e impede que sua resposta apareça na faixa seguinte; a requisição já iniciada pelo backend pode terminar até seu timeout.

Resultados ficam no armazenamento local por identificador de faixa, sob `bztune-lyrics-v1:`, e participam do backup JSON de configurações. A busca é explícita mesmo quando já existe uma letra: um resultado bem-sucedido seleciona o LRCLIB, preservando o arquivo manual. Os botões “Usar LRC importado” e “Usar LRCLIB salvo” permitem alternar a fonte; a seleção também participa do backup JSON. Falha de armazenamento gera aviso e mantém o resultado apenas na sessão. Letras locais e online com identificadores diferentes ainda têm caches separados.

A importação `.lrc` continua disponível. Ao restaurar, a seleção salva determina a fonte; sem seleção anterior, um LRC manual válido tem prioridade. Arquivos sem timestamps válidos são recusados antes de substituir a letra anterior. O parser suporta timestamps múltiplos e offset LRC em milissegundos. Não há busca automática, rolagem automática ou sincronização por palavra nesta implementação.

Validação: build TypeScript/Vite; testes de contrato HTTP; testes de respostas sincronizadas, simples e instrumentais, ausência de letras, timeout e falhas externas; testes do parser, cliente e backup. O endpoint real do LRCLIB não pôde ser acessado pela rede do ambiente; os testes HTTP usam respostas simuladas. O contrato foi conferido no código público do servidor LRCLIB, commit `04369d3f7c6e8cba1790629f26f866547a9b8f88`.

A versão 2.0.8 está preparada para publicação pelo workflow assinado existente; o resultado da publicação precisa ser confirmado no GitHub. Para o Android, o contrato de letras fica separado do componente visual, mas o transporte HTTP local ainda precisará de um adaptador mobile.

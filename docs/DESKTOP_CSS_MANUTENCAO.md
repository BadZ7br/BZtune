# Organização do CSS desktop

A entrada continua sendo `doomvault/src/styles.css`. O índice no topo identifica responsabilidades e os comentários ORIGEM preservam os blocos históricos. A organização desta etapa é por navegação/edição, **sem reagrupar fisicamente regras**, pois a ordem e especificidade dos overrides são parte do comportamento atual.

Procure primeiro a classe do componente atual e depois suas ocorrências posteriores. `bz32-*` corresponde ao player; `bz-player-*`, ao workspace/rodapé; `bz-lyrics-*`, à leitura; `pl-*`, a playlists; `ll-*`, à biblioteca. Variáveis de tema/densidade/fonte são transversais. Seletores gerados por estado/tema devem ser pesquisados também por prefixo no TSX.

63 regras antigas confirmadas foram removidas nesta revisão, além de duas duplicações exatas. Não interpretar classe ausente em busca literal como autorização automática para exclusão. As famílias adicionais do relatório precisam de revisão individual.

Não dividir em novos arquivos sem atualizar conscientemente o contrato do verificador de estrutura, as leituras CSS dos testes e comparar a saída compilada. Uma futura separação física deve preservar a sequência de regras e declarações, não apenas seus valores isolados.

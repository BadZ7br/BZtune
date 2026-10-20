# Aceitação de atualização HTTPS em Windows

**Estado: pendente de execução.** Este roteiro corresponde ao item 7 do relatório de atualizações. Em 20/10/2026, este ambiente é Linux e o responsável informou não ter Windows disponível. Não há comprovação de atualização completa com as correções locais.

## Evidência disponível

O manifesto `https://github.com/BadZ7br/BZtune/releases/latest/download/latest.json` respondeu HTTP 200 na consulta de 20/10/2026 e anunciou:

- Versão: `2.0.4`.
- Plataforma: `windows-x86_64`.
- Instalador: `https://github.com/BadZ7br/BZtune/releases/download/v2.0.4/BZtune-Setup-v2.0.4-x64.exe`.
- Campo de assinatura: presente.

Essa consulta não baixou/verificou o instalador nem executou o cliente Windows. A resposta do canal pode mudar; deve ser consultada novamente no dia do teste. A presença da assinatura não comprova sua validade. O teste histórico RC3 → RC4 por HTTP de loopback também não aprova este roteiro.

## Pré-requisitos para executar

1. Windows com WebView2 e um perfil de teste com biblioteca própria. Registrar as versões de ambos.
2. Dois builds Windows assinados com a mesma chave de atualização: uma versão base A e uma versão alvo B, com B maior que A. Registrar versão, commit e SHA-256 dos instaladores.
3. O build base precisa usar o endpoint HTTPS de produção. Builds RC de loopback não servem para essa comprovação.
4. Para validar as correções atuais, os binários precisam conter o código correspondente. Testar apenas versões antigas publicadas não comprova as mudanças locais. Gerar uma versão com número abaixo do canal atual pode fazer o aplicativo oferecer um pacote antigo sem essas correções; os números devem ser escolhidos antes da preparação dos builds.
5. B deve estar disponível no canal HTTPS consultado por A. Um arquivo em Actions Artifacts não é descoberto pelo endpoint `releases/latest`. Não publicar uma Release apenas para preencher o checklist sem concluir a preparação e a autorização correspondentes.
6. O pacote alvo deve passar pelo validador estrutural/criptográfico do workflow com a chave pública esperada e a configuração usada no build. A chave privada não participa da coleta de evidências.

## Preparar os dados e a evidência anterior

- Registrar a versão base exibida na interface e a identidade do instalador utilizado. Resolver eventual divergência de versão antes de interpretar a descoberta de atualização.
- Em Ferramentas → Backup, exportar **Biblioteca completa** e **Favoritos e configurações / Exportar JSON**. Manter os arquivos fora da pasta de instalação, sem restaurá-los durante o teste de preservação.
- Preparar faixas locais identificáveis, pelo menos uma playlist com ordem conhecida, favoritos e configurações visuais reconhecíveis. Registrar IDs, nomes, quantidades e ordem das faixas dessa amostra.
- Registrar o caminho da biblioteca apresentado pelo diagnóstico. Para instalações comuns, a referência é `%LOCALAPPDATA%\BZtune\library`; respeitar um caminho personalizado se houver.
- Registrar hashes SHA-256 das faixas da amostra, usando, por exemplo, `Get-FileHash -Algorithm SHA256 -LiteralPath "<arquivo>"`. Não modificar os arquivos entre as duas medições.
- Guardar a integridade e os dados relevantes do SQLite a partir do snapshot do backup. Não comparar apenas o hash bruto do banco: histórico de reprodução e outras gravações legítimas podem alterar seus bytes.

## Executar o fluxo normal

| Etapa | Critério de aprovação | Resultado / evidência |
| --- | --- | --- |
| Inicialização de A | Interface e biblioteca utilizáveis, versão registrada | Não executado |
| Descoberta automática | B é anunciada sem abrir a central ou instalar | Não executado |
| Consulta manual | B corresponde ao manifesto público HTTPS atual | Não executado |
| Download | Progresso aparece; a biblioteca não é encerrada antes da instalação | Não executado |
| Validação | Fim do download anuncia verificação; preparação só é anunciada após validação nativa | Não executado |
| Instalação | Clique explícito do usuário; troca pelo NSIS em modo quiet | Não executado |
| Encerramento | Backend desta instância é encerrado na entrega ao instalador | Não executado |
| Reabertura | Aplicativo reabre e informa a versão B esperada | Não executado |
| Biblioteca | Faixas acessíveis e reprodução real de áudio funcionando | Não executado |
| Playlists | IDs, conteúdo e ordem da amostra preservados | Não executado |
| Preferências | Tema, destaque, densidade, cantos e opções da amostra preservados | Não executado |
| Favoritos | Seleções da amostra preservadas | Não executado |
| Arquivos de áudio | Hashes da amostra iguais antes/depois | Não executado |
| SQLite | Integridade aprovada e registros esperados preservados | Não executado |
| Encerramento de B | Serviço próprio é encerrado, sem matar processos de outras instâncias | Não executado |

Depois de atualizar, exportar novamente a biblioteca e o JSON. Comparar o objeto `settings` dos JSONs, não o horário de exportação. Para as preferências visuais, conferir especialmente `bztune-settings-v1`; para favoritos, `doomvault-favorites`. Registrar separadamente mudanças legítimas de fila, posição de reprodução, última página ou histórico. Divergências inesperadas não devem ser classificadas automaticamente como aprovação.

## Exercitar falhas de forma isolada

Não substituir o manifesto público de produção por pacotes corrompidos ou inválidos. Cenários que exigem alterar pacote/assinatura devem usar um ambiente HTTPS de homologação isolado e um cliente preparado para ele, registrando que essa parte não usou o canal de produção.

| Cenário | Resultado esperado | Resultado / evidência |
| --- | --- | --- |
| Rede indisponível na consulta | Mensagem de conexão/limite; nova consulta possível | Não executado |
| Transferência interrompida | Nenhuma instalação; oferta descartada; nova busca possível | Não executado |
| Pacote alterado ou assinatura inválida | Rejeição antes de instalar e antes de encerrar o backend | Não executado |
| Falha de abertura do instalador | Backend restaurado e validado; ou indisponibilidade explicitamente informada | Não executado |
| Falha na recuperação do backend | Sem anúncio falso de serviço pronto; aplicativo não encerrado pela rotina de recuperação | Não executado |
| A já é a versão atual | Sem instalação da mesma versão ou de versão inferior | Não executado |

## Registro final

Preencher um registro por execução:

- Data, responsável, Windows e WebView2:
- Versões A e B, commits e hashes dos instaladores:
- URL estável do manifesto e versão observada no momento do teste:
- Resultado da validação criptográfica anterior à distribuição:
- Backups/JSONs e medições antes/depois:
- Evidência de download, validação, instalação quiet e reabertura:
- Resultado individual de cada cenário de falha:
- Falhas encontradas e passos para reproduzir:
- Parecer: **não executado / reprovado / parcialmente aprovado / aprovado**.

Aprovar o fluxo normal HTTPS somente com descoberta, instalação, reabertura e preservação documentadas. Manter os cenários de falha pendentes quando não forem exercitados. Não anexar chaves privadas, tokens ou a biblioteca pessoal a registros públicos.

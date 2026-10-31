# Validação Android

## Etapa 1 — versão 0.3.0

- GitHub Actions 41150380305 concluído com sucesso; APK de teste disponível.
- Compilação local e CI: minSdk 24, ARM de 32/64 bits, assinatura debug válida.
- Testes automatizados de fila, biblioteca SQLite em API 24 simulada e interface aprovados.
- Proprietário confirmou no chat: importação e reprodução com tela apagada funcionaram no A56.

A confirmação é um teste manual do proprietário, não uma medição automática neste ambiente.
Não foram informadas as versões de Android/WebView. Fones/Bluetooth, chamadas,
consumo prolongado de bateria e execução no J5 permanecem pendentes.

Próxima etapa: configurar chave Android estável; depois backup e organização da biblioteca.


## Etapa 2 — preparação de assinatura

Configuração Gradle, scripts de geração/preparação e conferência de identidade
implementados. Oito testes de configuração, integração de assinatura real com chave
temporária e seleção do certificado pelo Gradle aprovados. A ativação da identidade
fixa aguarda os secrets/variable do proprietário no GitHub. A API disponível retornou
Forbidden ao consultar o endpoint necessário para administrar esses secrets.
Guia: ANDROID_ASSINATURA.md. Não registrar a etapa como ativada antes do APK do CI
ser conferido com o SHA-256 definitivo.

Fluxo alternativo por celular preparado: workflow manual gera a chave em Actions e
armazena os valores via token temporário restrito. Não foi executado para a identidade
definitiva: requer cadastro do token pelo proprietário. Testes verificam que ele recusa
sobrescrever identidade e que valores privados não entram nos argumentos/logs.

# Capturas da interface Android 0.8.0

PNGs produzidos pelo teste `tests/mobile/android-navigation.cjs`, com o build real
React/Vite em Chromium, viewport 412×892 e ponte Android **simulada explicitamente**.
Os nomes de faixa/artista são dados fictícios de teste. Não são capturas de um A56,
de um APK executando áudio real nem imagens geradas por um modelo.

- [Início e miniplayer](inicio.png)
- [Player completo](player.png)
- [Fila de reprodução](fila.png)

Para gerar novamente, inicie o preview mobile e execute:

```sh
CHROMIUM_PATH=/usr/bin/chromium BZTUNE_CAPTURE_DIR=artifacts/android-0.8.0 node tests/mobile/android-navigation.cjs
```

A versão usa placeholder quando não há thumbnail disponível ou a imagem falha.

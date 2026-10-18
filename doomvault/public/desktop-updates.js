(function () {
  // No navegador web comum não desenha nem consulta o updater.
  const tauri = window.__TAURI__;
  if (!tauri || !tauri.core || typeof tauri.core.invoke !== "function") return;
  const invoke = tauri.core.invoke;

  const style = document.createElement("style");
  style.textContent = [
    "#bztune-desktop-open{position:fixed;bottom:96px;left:22px;z-index:99999;border:1px solid #666;background:#202020;color:#e7e7e7;border-radius:12px;padding:9px 14px;font:600 13px system-ui;cursor:pointer;box-shadow:0 6px 22px #0009}",
    "#bztune-desktop-open.has-update{border-color:#b8db7c;color:#d8f5a1}",
    "#bztune-desktop-panel{position:fixed;bottom:148px;left:22px;z-index:99999;width:min(370px,calc(100vw - 44px));max-height:72vh;overflow:auto;background:#141414;color:#ededed;border:1px solid #555;border-radius:16px;padding:18px;font:14px system-ui;box-shadow:0 12px 45px #000c}",
    "#bztune-desktop-panel [hidden]{display:none!important}",
    "#bztune-desktop-panel button{border:1px solid #666;background:#292929;color:#f2f2f2;padding:9px 12px;border-radius:9px;cursor:pointer;margin:5px 6px 5px 0}",
    "#bztune-desktop-panel button:disabled{opacity:.45;cursor:wait}",
    "#bztune-desktop-panel p{line-height:1.45;white-space:pre-wrap}",
    "#bztune-desktop-panel .bztune-close{float:right}",
    "#bztune-desktop-panel .bztune-muted{color:#b4b4b4;font-size:12px}",
    "#bztune-update-progress{width:100%;height:12px;accent-color:#b8db7c;margin:6px 0}",
    "#bztune-update-stage{display:block;margin:4px 0 9px}"
  ].join("\n");
  document.head.appendChild(style);

  const toggle = document.createElement("button");
  toggle.id = "bztune-desktop-open";
  toggle.type = "button";
  toggle.textContent = "⚙ Atualizações";
  toggle.title = "Central de atualizações do BZtune Desktop";
  document.body.appendChild(toggle);

  const panel = document.createElement("section");
  panel.id = "bztune-desktop-panel";
  panel.setAttribute("role", "dialog");
  panel.setAttribute("aria-label", "Atualizações do BZtune");
  panel.hidden = true;
  panel.style.display = "none";
  panel.innerHTML = '<button class="bztune-close" type="button" aria-label="Fechar">✕</button><h3>Atualizações do BZtune</h3><div class="bztune-muted" id="bztune-current-version">Carregando versão...</div><p id="bztune-update-message" aria-live="polite">Procurando atualizações...</p><div id="bztune-release-notes" class="bztune-muted"></div><progress id="bztune-update-progress" max="100" hidden aria-label="Progresso do download"></progress><span id="bztune-update-stage" class="bztune-muted" hidden></span><button id="bztune-check" type="button">Buscar atualizações</button><button id="bztune-install" type="button" hidden>Atualizar agora</button>';
  document.body.appendChild(panel);

  const message = panel.querySelector("#bztune-update-message");
  const notes = panel.querySelector("#bztune-release-notes");
  const check = panel.querySelector("#bztune-check");
  const install = panel.querySelector("#bztune-install");
  const progress = panel.querySelector("#bztune-update-progress");
  const stage = panel.querySelector("#bztune-update-stage");
  let working = false;
  let availableVersion = null;
  let downloaded = 0;

  function setPanelOpen(open) {
    panel.hidden = !open;
    panel.style.display = open ? "block" : "none";
  }
  toggle.addEventListener("click", () => setPanelOpen(panel.hidden));
  panel.querySelector(".bztune-close").addEventListener("click", () => setPanelOpen(false));

  function setBusy(busy) {
    working = busy;
    check.disabled = busy;
    install.disabled = busy;
  }
  function setStage(text) {
    stage.hidden = !text;
    stage.textContent = text || "";
  }
  function resetProgress() {
    downloaded = 0;
    progress.hidden = true;
    progress.removeAttribute("value");
    setStage("");
  }
  function showAvailable(result) {
    availableVersion = result.version;
    message.textContent = "Atualização disponível: " + result.version;
    notes.textContent = result.notes || "Sem notas de versão.";
    install.hidden = false;
    toggle.classList.add("has-update");
    toggle.textContent = "↓ Atualização " + result.version;
  }
  function clearAvailable() {
    availableVersion = null;
    install.hidden = true;
    toggle.classList.remove("has-update");
    toggle.textContent = "⚙ Atualizações";
  }

  invoke("desktop_version")
    .then(v => { panel.querySelector("#bztune-current-version").textContent = "Versão instalada: " + v; })
    .catch(() => { panel.querySelector("#bztune-current-version").textContent = "Versão indisponível"; });

  async function onCheck(automatic = false) {
    if (working) return;
    setBusy(true);
    clearAvailable();
    resetProgress();
    message.textContent = "Procurando atualizações assinadas...";
    notes.textContent = "";
    try {
      const result = await invoke("desktop_check_update");
      if (result && result.version) showAvailable(result);
      else message.textContent = "Você já está usando a versão mais recente.";
    } catch (error) {
      // A verificação no início não deve interromper a reprodução quando estiver offline.
      message.textContent = automatic
        ? "Não foi possível verificar agora. Tente novamente mais tarde."
        : "Não foi possível verificar: " + String(error);
    } finally {
      setBusy(false);
    }
  }

  async function onInstall() {
    if (working || !availableVersion) return;
    setBusy(true);
    install.hidden = true;
    progress.hidden = false;
    progress.removeAttribute("value"); // percentual desconhecido até receber o tamanho do pacote
    message.textContent = "Baixando atualização " + availableVersion + "...";
    setStage("Baixando e verificando pacote assinado. Continue com o BZtune aberto.");
    try {
      // O Windows encerra o aplicativo ao iniciar a instalação silenciosa;
      // a próxima execução abrirá a versão atualizada automaticamente.
      await invoke("desktop_install_update");
      message.textContent = "Atualização entregue ao instalador silencioso. Aguarde o reinício.";
      setStage("A instalação está sendo aplicada pelo Windows, sem assistente visual.");
    } catch (error) {
      message.textContent = "Não foi possível concluir a atualização: " + String(error);
      setStage("Nenhuma alteração na biblioteca. Clique em Buscar atualizações para tentar novamente.");
      progress.hidden = true;
      clearAvailable(); // o Rust descarta o pacote pendente; precisamos buscar novamente
    } finally {
      setBusy(false);
    }
  }

  check.addEventListener("click", () => { void onCheck(false); });
  install.addEventListener("click", () => { void onInstall(); });

  if (tauri.event && typeof tauri.event.listen === "function") {
    tauri.event.listen("bztune-update-progress", event => {
      if (!working) return;
      const value = event.payload;
      if (!Array.isArray(value)) return;
      const bytes = Number(value[0]);
      const total = Number(value[1]);
      if (!Number.isFinite(bytes) || bytes < 0) return;
      downloaded = bytes;
      if (Number.isFinite(total) && total > 0) {
        const percent = Math.min(100, Math.floor(downloaded / total * 100));
        progress.value = percent;
        message.textContent = "Baixando atualização: " + percent + "%";
        setStage("Transferidos " + (downloaded / 1048576).toFixed(1) + " de " + (total / 1048576).toFixed(1) + " MB");
      } else {
        progress.removeAttribute("value");
        message.textContent = "Baixando atualização...";
        setStage("Transferidos " + (downloaded / 1048576).toFixed(1) + " MB");
      }
    }).catch(() => { /* atualização continua mesmo sem indicação percentual */ });

    tauri.event.listen("bztune-update-finished", () => {
      if (!working) return;
      progress.value = 100;
      message.textContent = "Download concluído. Preparando a instalação silenciosa...";
      setStage("O BZtune será fechado durante a troca dos arquivos e reaberto após a atualização.");
    }).catch(() => {});
  }

  // Consulta não intrusiva: avisa pelo botão sem interromper músicas ou abrir janelas.
  window.setTimeout(() => { void onCheck(true); }, 3000);
})();

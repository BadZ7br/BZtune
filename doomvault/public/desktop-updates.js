(function () {
  // No navegador web comum não desenha nem consulta o updater.
  const tauri = window.__TAURI__;
  if (!tauri || !tauri.core || typeof tauri.core.invoke !== "function") return;
  const invoke = tauri.core.invoke;

  const style = document.createElement("style");
  style.textContent = [
    "#bztune-desktop-open{position:static;display:flex;align-items:center;gap:calc(8px * var(--bz-ui-space-scale,1));width:100%;min-height:var(--bz-settings-target-size,44px);border:1px solid var(--theme-border,#363636);background:var(--theme-surface,#1b1b1b);color:var(--theme-text,#e7e7e7);border-radius:calc(8px * var(--bz-ui-corner-scale,1));padding:calc(10px * var(--bz-ui-space-scale,1)) calc(12px * var(--bz-ui-space-scale,1));font:600 0.8125rem system-ui;text-align:left;cursor:pointer}",
    "#bztune-desktop-open.has-update{border-color:var(--theme-accent-border,#b8db7c);color:var(--theme-accent-text,#d8f5a1)}",
    "#bztune-desktop-panel{position:fixed;margin:0;box-sizing:border-box;max-width:calc(100vw - 32px);overscroll-behavior:contain;top:50%;left:50%;transform:translate(-50%,-50%);z-index:99999;width:min(410px,calc(100vw - 32px));max-height:calc(100vh - 32px);overflow:auto;background:var(--bz-glass-surface,var(--theme-surface,#141414));color:var(--theme-text,#ededed);border:1px solid var(--theme-border,#555);border-radius:calc(16px * var(--bz-ui-corner-scale,1));padding:calc(18px * var(--bz-ui-space-scale,1));font:0.875rem system-ui;box-shadow:var(--bz-depth-shadow,0 12px 45px var(--theme-shadow,#000c));backdrop-filter:var(--bz-glass-blur,none)}",
    "#bztune-desktop-panel::backdrop{background:rgba(0,0,0,.55)}",
    "#bztune-desktop-panel [hidden]{display:none!important}",
    "#bztune-desktop-panel button{min-width:var(--bz-settings-target-size,44px);min-height:var(--bz-settings-target-size,44px);border:1px solid var(--theme-border,#666);background:var(--theme-raised,#292929);color:var(--theme-text,#f2f2f2);padding:calc(9px * var(--bz-ui-space-scale,1)) calc(12px * var(--bz-ui-space-scale,1));border-radius:calc(9px * var(--bz-ui-corner-scale,1));cursor:pointer;margin:5px 6px 5px 0}",
    "#bztune-desktop-panel button:disabled{opacity:.45;cursor:wait}",
    "#bztune-desktop-panel p{line-height:1.45;white-space:pre-wrap}",
    "#bztune-desktop-panel .bztune-close{float:right}",
    "#bztune-desktop-panel .bztune-muted{color:var(--theme-muted,#b4b4b4);font-size:0.75rem}",
    "#bztune-update-progress{width:100%;height:12px;accent-color:var(--theme-accent-fill,#b8db7c);margin:6px 0}",
    "#bztune-update-stage{display:block;margin:4px 0 9px}"
  ].join("\n");
  document.head.appendChild(style);

  const toggle = document.createElement("button");
  toggle.id = "bztune-desktop-open";
  toggle.type = "button";
  toggle.textContent = "⚙ Atualizações";
  toggle.title = "Central de atualizações do BZtune Desktop";
  // A entrada fica no fluxo da navegação (não sobreposta ao conteúdo).
  // Como React e o script defer podem iniciar em ordens diferentes, aguarda o slot.
  function mountToggle() {
    const slot = document.getElementById("bztune-desktop-update-slot");
    if (!slot) return false;
    slot.appendChild(toggle);
    return true;
  }
  if (!mountToggle()) {
    const observer = new MutationObserver(() => {
      if (mountToggle()) observer.disconnect();
    });
    observer.observe(document.getElementById("root") || document.body, {
      childList: true, subtree: true
    });
  }

  const panel = document.createElement("dialog");
  panel.id = "bztune-desktop-panel";
  panel.setAttribute("role", "dialog");
  panel.setAttribute("aria-modal", "true");
  panel.tabIndex = -1;
  panel.setAttribute("aria-label", "Atualizações do BZtune");
  panel.hidden = true;
  panel.style.display = "none";
  panel.innerHTML = '<button class="bztune-close" type="button" aria-label="Fechar" autofocus>✕</button><h3>Atualizações do BZtune</h3><div class="bztune-muted" id="bztune-current-version">Carregando versão...</div><div class="bztune-muted" id="bztune-update-channel">Identificando canal...</div><p id="bztune-update-message" aria-live="polite">Verificando disponibilidade do atualizador...</p><div id="bztune-release-notes" class="bztune-muted"></div><progress id="bztune-update-progress" max="100" hidden aria-label="Progresso do download"></progress><span id="bztune-update-stage" class="bztune-muted" hidden></span><button id="bztune-check" type="button" disabled>Buscar atualizações</button><button id="bztune-install" type="button" hidden>Atualizar agora</button>';
  document.body.appendChild(panel);

  const message = panel.querySelector("#bztune-update-message");
  const notes = panel.querySelector("#bztune-release-notes");
  const check = panel.querySelector("#bztune-check");
  const install = panel.querySelector("#bztune-install");
  const progress = panel.querySelector("#bztune-update-progress");
  const stage = panel.querySelector("#bztune-update-stage");
  let updateStatus = null;
  let statusRequest = null;
  let working = false;
  let availableVersion = null;
  let downloaded = 0;
  let installPhase = null;

  const closeButton = panel.querySelector(".bztune-close");
  let returnFocus = null;
  let previousOverflow = "";
  let modalActive = false;

  function visibleControl(element) {
    return element && element !== document.body && element !== document.documentElement
      && typeof element.focus === "function" && element.isConnected && !element.matches(":disabled")
      && !element.closest("[hidden], [inert]") && element.getClientRects().length > 0
      && window.getComputedStyle(element).visibility !== "hidden";
  }
  function finishClosing() {
    if (!modalActive) return;
    modalActive = false;
    panel.hidden = true;
    panel.style.display = "none";
    document.body.style.overflow = previousOverflow;
    const target = [returnFocus, toggle,
      document.querySelector?.("[data-bztune-system-nav]"),
      document.querySelector?.(".mobile-menu-button")].find(visibleControl);
    target?.focus({ preventScroll: true });
    returnFocus = null;
  }
  function setPanelOpen(open) {
    if (open) {
      if (panel.open) return;
      returnFocus = document.activeElement;
      previousOverflow = document.body.style.overflow || "";
      modalActive = true;
      panel.hidden = false;
      panel.style.display = "block";
      // The native modal also makes the background inert and works above the full player.
      panel.showModal();
      document.body.style.overflow = "hidden";
      closeButton.focus();
    } else if (panel.open) {
      panel.close();
      finishClosing();
    }
  }
  function ensurePanelFocus() {
    if (panel.open && (!panel.contains(document.activeElement) || !visibleControl(document.activeElement))) {
      closeButton.focus();
    }
  }
  toggle.addEventListener("click", () => setPanelOpen(!panel.open));
  closeButton.addEventListener("click", () => setPanelOpen(false));
  panel.addEventListener("cancel", event => {
    event.preventDefault();
    setPanelOpen(false);
  });
  panel.addEventListener("close", () => {
    if (!panel.open) finishClosing();
  });
  panel.addEventListener("keydown", event => {
    if (event.key !== "Tab" || event.defaultPrevented) return;
    const controls = [...panel.querySelectorAll("button, a[href], input, select, textarea, [tabindex]")]
      .filter(element => element.tabIndex >= 0 && visibleControl(element));
    const first = controls[0];
    const last = controls[controls.length - 1];
    if (!first) {
      event.preventDefault();
      panel.focus();
    } else if (!controls.includes(document.activeElement)
      || (event.shiftKey && document.activeElement === first)
      || (!event.shiftKey && document.activeElement === last)) {
      event.preventDefault();
      (event.shiftKey ? last : first).focus();
    }
  });

  function setBusy(busy) {
    working = busy;
    check.disabled = busy || (updateStatus !== null && !updateStatus.enabled);
    install.disabled = busy;
    ensurePanelFocus();
  }
  function setStage(text) {
    stage.hidden = !text;
    stage.textContent = text || "";
  }
  function resetProgress() {
    installPhase = null;
    downloaded = 0;
    progress.hidden = true;
    progress.removeAttribute("value");
    setStage("");
  }
  function updateSystemBadge(hasUpdate) {
    const systemButton = document.querySelector?.("[data-bztune-system-nav]");
    if (!systemButton) return;
    systemButton.classList.toggle("has-update", hasUpdate);
    systemButton.setAttribute("aria-label", hasUpdate ? "Sistema — atualização disponível" : "Sistema");
  }

  function showAvailable(result) {
    availableVersion = result.version;
    message.textContent = "Atualização disponível: " + result.version;
    notes.textContent = result.notes || "Sem notas de versão.";
    install.hidden = false;
    toggle.classList.add("has-update");
    updateSystemBadge(true);
    toggle.textContent = "↓ Atualização " + result.version;
  }
  function clearAvailable() {
    availableVersion = null;
    install.hidden = true;
    ensurePanelFocus();
    toggle.classList.remove("has-update");
    updateSystemBadge(false);
    toggle.textContent = "⚙ Atualizações";
  }

  function loadStatus() {
    if (statusRequest) return statusRequest;
    check.disabled = true;
    statusRequest = invoke("desktop_update_status").then(status => {
      const labels = {
        public: "Canal público · GitHub Releases",
        local: "Teste local · laboratório",
        preview: "Preview · atualizações desabilitadas",
        custom: "Canal personalizado · HTTPS",
        unconfigured: "Canal não configurado"
      };
      if (!status || typeof status.version !== "string" || !status.version
        || typeof status.enabled !== "boolean" || !Object.hasOwn(labels, status.channel)
        || (status.enabled && ["preview", "unconfigured"].includes(status.channel))) {
        throw new Error("Invalid updater status");
      }
      updateStatus = status;
      panel.querySelector("#bztune-current-version").textContent = "Versão instalada: " + status.version;
      panel.querySelector("#bztune-update-channel").textContent = labels[status.channel];
      if (!status.enabled) {
        message.textContent = status.channel === "preview"
          ? "Esta versão de preview não recebe atualizações pelo aplicativo. Use uma versão com atualizações assinadas habilitadas para consultar o canal."
          : "O atualizador está desabilitado nesta compilação. Instale uma versão com atualizações assinadas configuradas.";
      } else {
        message.textContent = status.channel === "local"
          ? "Este build consulta somente o servidor de teste local. Não consulta as versões públicas do GitHub."
          : "Você pode buscar novas versões neste canal. A consulta automática apenas avisa; a instalação depende da sua confirmação.";
      }
      check.textContent = "Buscar atualizações";
    }).catch(() => {
      updateStatus = null;
      panel.querySelector("#bztune-current-version").textContent = "Versão indisponível";
      panel.querySelector("#bztune-update-channel").textContent = "Canal não identificado";
      message.textContent = "Não foi possível identificar o atualizador desta instalação. Clique em Tentar novamente.";
      check.textContent = "Tentar novamente";
    }).finally(() => {
      statusRequest = null;
      setBusy(false);
    });
    return statusRequest;
  }
  void loadStatus();

  // O canal de produção pode estar sem Release, offline ou indisponível.
  // Evita expor detalhes técnicos do Tauri, URLs locais e mensagens de bibliotecas.
  function updateErrorMessage(error, operation) {
    const detail = String(error || "").toLowerCase();
    if (detail.includes("bztune_update_backend_restored")) {
      return "Não foi possível abrir o instalador. O serviço local foi restaurado e você pode continuar usando o BZtune.";
    }
    if (detail.includes("bztune_update_backend_unavailable")) {
      return "Não foi possível abrir o instalador nem restaurar o serviço local. Feche e abra o BZtune para tentar novamente.";
    }
    if (detail.includes("bztune_update_check_timeout")) {
      return "A consulta de atualizações excedeu o tempo limite. Verifique a conexão e clique em Buscar atualizações para tentar novamente.";
    }
    if (detail.includes("bztune_update_download_timeout")) {
      return "O download excedeu o tempo limite e o pacote incompleto foi descartado. Clique em Buscar atualizações para tentar novamente.";
    }
    if (/assinad|not enabled|not habilitad|release_signed/.test(detail)) {
      return "Atualizações automáticas exigem uma compilação assinada do BZtune.";
    }
    if (/signature|public key|pubkey|invalid key|assinatura inválida/.test(detail)) {
      return "Não foi possível confirmar a assinatura de segurança da atualização. Nenhum pacote foi aplicado.";
    }
    if (/could not fetch a valid release json|release json|release manifest|\b404\b|\bnot found\b|invalid json|unexpected end of json/.test(detail)) {
      return "O canal de atualizações ainda não disponibilizou um manifesto válido. Isso pode acontecer antes da primeira Release ou durante uma indisponibilidade do GitHub.";
    }
    if (/offline|network|connection|dns|timed? ?out|failed to fetch|could not connect|network error|no such host/.test(detail)) {
      return "Não foi possível conectar ao serviço de atualizações. Verifique a internet e tente novamente.";
    }
    return operation === "install"
      ? "Não foi possível concluir a atualização. O BZtune pode tentar novamente após uma nova verificação."
      : "Não foi possível verificar atualizações agora. Tente novamente mais tarde.";
  }

  async function onCheck(automatic = false) {
    if (working) return;
    if (!updateStatus) {
      await loadStatus();
      if (!automatic) return;
    }
    if (!updateStatus?.enabled || working) return;
    setBusy(true);
    clearAvailable();
    resetProgress();
    message.textContent = "Procurando atualizações assinadas...";
    notes.textContent = "";
    try {
      const result = await invoke("desktop_check_update");
      if (result && result.version) showAvailable(result);
      else message.textContent = "Nenhuma versão mais nova que a instalada está disponível neste canal.";
    } catch (error) {
      // A verificação no início não deve interromper a reprodução quando estiver offline.
      message.textContent = updateErrorMessage(error, "check");
    } finally {
      setBusy(false);
    }
  }

  async function onInstall() {
    if (working || !updateStatus?.enabled || !availableVersion) return;
    setBusy(true);
    installPhase = "downloading";
    install.hidden = true;
    progress.hidden = false;
    progress.removeAttribute("value"); // percentual desconhecido até receber o tamanho do pacote
    message.textContent = "Baixando atualização " + availableVersion + "...";
    setStage("Baixando o pacote. Continue com o BZtune aberto.");
    try {
      // O Windows encerra o aplicativo ao iniciar a instalação silenciosa;
      // a próxima execução abrirá a versão atualizada automaticamente.
      await invoke("desktop_install_update");
      message.textContent = "Atualização entregue ao instalador silencioso. Aguarde o reinício.";
      setStage("A instalação está sendo aplicada pelo Windows, sem assistente visual.");
    } catch (error) {
      message.textContent = updateErrorMessage(error, "install");
      setStage(String(error).includes("BZTUNE_UPDATE_BACKEND_UNAVAILABLE")
        ? "A biblioteca está temporariamente indisponível. Reabra o aplicativo para restaurar o serviço local."
        : "Nenhuma alteração na biblioteca. Clique em Buscar atualizações para tentar novamente.");
      progress.hidden = true;
      clearAvailable(); // o Rust descarta o pacote pendente; precisamos buscar novamente
    } finally {
      setBusy(false);
      installPhase = null;
    }
  }

  check.addEventListener("click", () => { void onCheck(false); });
  install.addEventListener("click", () => { void onInstall(); });

  if (tauri.event && typeof tauri.event.listen === "function") {
    tauri.event.listen("bztune-backend-restoring", () => {
      if (!working || !installPhase || installPhase === "restoring") return;
      installPhase = "restoring";
      progress.hidden = true;
      message.textContent = "O instalador não abriu. Restaurando o serviço local...";
      setStage("Aguarde a verificação do serviço antes de tentar atualizar novamente.");
    }).catch(() => {});

    tauri.event.listen("bztune-update-progress", event => {
      if (!working || installPhase !== "downloading") return;
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
      if (!working || installPhase !== "downloading") return;
      installPhase = "verifying";
      progress.value = 100;
      message.textContent = "Download concluído. Verificando a assinatura de segurança...";
      setStage("Aguarde a validação do pacote antes da instalação.");
    }).catch(() => {});

    tauri.event.listen("bztune-update-verified", () => {
      if (!working || !["downloading", "verifying"].includes(installPhase)) return;
      installPhase = "installing";
      progress.value = 100;
      message.textContent = "Assinatura verificada. Preparando a abertura do instalador...";
      setStage("O BZtune será fechado ao iniciar a instalação e reaberto após a atualização.");
    }).catch(() => {});
  }

  // Consulta não intrusiva: avisa pelo botão sem interromper músicas ou abrir janelas.
  window.setTimeout(() => {
    try {
      const preferences = JSON.parse(localStorage.getItem("bztune-settings-v1") || "null");
      if (preferences?.autoUpdates === false) return;
    } catch { /* configuração inválida: manter a checagem segura padrão */ }
    void onCheck(true);
  }, 3000);
})();

(function () {
  // O arquivo é carregado no navegador também, mas não desenha nada fora do Tauri.
  const tauri = window.__TAURI__;
  if (!tauri || !tauri.core || typeof tauri.core.invoke !== "function") return;
  const invoke = tauri.core.invoke;
  const style = document.createElement("style");
  style.textContent = `
  #bztune-desktop-open{position:fixed;bottom:96px;left:22px;z-index:99999;border:1px solid #666;background:#202020;color:#e7e7e7;border-radius:12px;padding:9px 14px;font:600 13px system-ui;cursor:pointer;box-shadow:0 6px 22px #0009}
  #bztune-desktop-panel{position:fixed;bottom:148px;left:22px;z-index:99999;width:min(370px,calc(100vw - 44px));max-height:72vh;overflow:auto;background:#141414;color:#ededed;border:1px solid #555;border-radius:16px;padding:18px;font:14px system-ui;box-shadow:0 12px 45px #000c}
  #bztune-desktop-panel button{border:1px solid #666;background:#292929;color:#f2f2f2;padding:9px 12px;border-radius:9px;cursor:pointer;margin:5px 6px 5px 0}
  #bztune-desktop-panel button:disabled{opacity:.45;cursor:wait} #bztune-desktop-panel p{line-height:1.45;white-space:pre-wrap}
  #bztune-desktop-panel .bztune-close{float:right} #bztune-desktop-panel .bztune-muted{color:#b4b4b4;font-size:12px}
  `;
  document.head.appendChild(style);
  const toggle = document.createElement("button");
  toggle.id = "bztune-desktop-open";
  toggle.textContent = "⚙ Atualizações";
  toggle.title = "Central de atualizações do BZtune Desktop";
  document.body.appendChild(toggle);
  const panel = document.createElement("section");
  panel.id = "bztune-desktop-panel";
  panel.setAttribute("role", "dialog");
  panel.setAttribute("aria-label", "Atualizações do BZtune");
  panel.hidden = true;
  panel.innerHTML = '<button class="bztune-close" type="button" aria-label="Fechar">✕</button><h3>Atualizações do BZtune</h3><div class="bztune-muted" id="bztune-current-version">Carregando versão...</div><p id="bztune-update-message" aria-live="polite">Verifique se há uma atualização disponível.</p><div id="bztune-release-notes" class="bztune-muted"></div><button id="bztune-check" type="button">Buscar atualizações</button><button id="bztune-install" type="button" hidden>Instalar atualização</button>';
  document.body.appendChild(panel);
  // hidden prevalece sobre o CSS customizado.
  const reveal = () => { panel.hidden = !panel.hidden; panel.style.display = panel.hidden ? "none" : "block"; };
  panel.style.display = "none";
  toggle.addEventListener("click", reveal);
  panel.querySelector(".bztune-close").addEventListener("click", reveal);
  const message = panel.querySelector("#bztune-update-message");
  const notes = panel.querySelector("#bztune-release-notes");
  const check = panel.querySelector("#bztune-check");
  const install = panel.querySelector("#bztune-install");
  let working = false;
  invoke("desktop_version").then(v => { panel.querySelector("#bztune-current-version").textContent = "Versão instalada: " + v; }).catch(() => {});
  async function onCheck() {
    if (working) return;
    working = true; check.disabled = true; install.hidden = true;
    message.textContent = "Procurando atualizações assinadas...";
    notes.textContent = "";
    try {
      const result = await invoke("desktop_check_update");
      if (!result) message.textContent = "Você já está usando a versão mais recente.";
      else {
        message.textContent = "Atualização disponível: " + result.version;
        notes.textContent = result.notes || "Sem notas de versão.";
        install.hidden = false;
      }
    } catch (error) { message.textContent = "Não foi possível verificar: " + String(error); }
    finally { working = false; check.disabled = false; }
  }
  async function onInstall() {
    if (working || !window.confirm("Instalar atualização assinada? O BZtune será reiniciado.")) return;
    working = true; check.disabled = true; install.disabled = true;
    message.textContent = "Baixando e verificando assinatura...";
    try { await invoke("desktop_install_update"); }
    catch (error) { message.textContent = "Instalação não concluída: " + String(error); }
    finally { working = false; check.disabled = false; install.disabled = false; }
  }
  check.addEventListener("click", onCheck);
  install.addEventListener("click", onInstall);
  if (tauri.event && typeof tauri.event.listen === "function") {
    tauri.event.listen("bztune-update-progress", event => {
      const value = event.payload;
      if (Array.isArray(value) && value[1]) message.textContent = "Baixando: " + Math.min(100, Math.floor(value[0] / value[1] * 100)) + "%";
    }).catch(() => {});
  }
})();

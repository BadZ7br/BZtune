import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import vm from "node:vm";

const source = readFileSync(new URL("../doomvault/public/desktop-updates.js", import.meta.url), "utf8");

class Element {
  constructor() {
    this.textContent = "";
    this.hidden = false;
    this.disabled = false;
    this.style = {};
    this.listeners = new Map();
    this.children = [];
    this.classes = new Set();
    this.classList = {
      add: name => this.classes.add(name),
      remove: name => this.classes.delete(name),
      contains: name => this.classes.has(name),
    };
  }
  appendChild(el) { this.children.push(el); }
  setAttribute() {}
  removeAttribute() {}
  addEventListener(name, callback) { this.listeners.set(name, callback); }
  querySelector(key) {
    this.refs ??= new Map();
    if (!this.refs.has(key)) this.refs.set(key, new Element());
    return this.refs.get(key);
  }
  click() { this.listeners.get("click")?.(); }
}

function setup({ check = null, installError = null, install = null, status = { version: "2.0.3", channel: "public", enabled: true } } = {}) {
  const root = new Element(), panel = new Element(), slot = new Element();
  const timers = [];
  const calls = [];
  const events = new Map();
  const invoke = async command => {
    calls.push(command);
    if (command === "desktop_update_status") {
      if (status instanceof Error) throw status;
      return typeof status === "function" ? status() : status;
    }
    if (command === "desktop_version") return "2.0.3";
    if (command === "desktop_check_update") {
      if (check instanceof Error) throw check;
      return typeof check === "function" ? check() : check;
    }
    if (command === "desktop_install_update") {
      if (installError) throw Error(installError);
      return install?.();
    }
    throw Error("Comando inesperado: " + command);
  };
  const document = {
    head: new Element(), body: new Element(),
    createElement: tag => tag === "dialog" ? panel : new Element(),
    getElementById: key => ({ root, "bztune-desktop-update-slot": slot })[key] ?? null,
  };
  const window = {
    __TAURI__: { core: { invoke }, event: { listen: async (name, callback) => { events.set(name, callback); } } },
    setTimeout: (fn, ms) => { timers.push({ fn, ms }); return timers.length; },
    clearTimeout() {},
  };
  vm.runInNewContext(source, { window, document });
  const message = panel.querySelector("#bztune-update-message");
  const checkButton = panel.querySelector("#bztune-check");
  const installButton = panel.querySelector("#bztune-install");
  installButton.hidden = true; // Mirrors the initial hidden attribute in the dialog HTML.
  const flush = () => new Promise(resolve => setImmediate(resolve));
  return {
    calls, message, panel, checkButton, installButton, toggle: slot.children[0],
    progress: panel.querySelector("#bztune-update-progress"),
    stage: panel.querySelector("#bztune-update-stage"),
    emit(name, payload) { events.get(name)?.({ payload }); },
    async check() { await flush(); checkButton.click(); await flush(); },
    async autoCheck() {
      await flush();
      const auto = timers.find(x => x.ms === 3000);
      assert.ok(auto, "checagem automática agendada");
      auto.fn(); await flush();
    },
    flush,
  };
}

test("sem primeiro manifesto, explicação sem erro cru", async () => {
  const ui = setup({ check: Error("Could not fetch a valid release JSON from the remote") });
  await ui.check();
  assert.match(ui.message.textContent, /manifesto válido/);
  assert.match(ui.message.textContent, /primeira Release/);
  assert.doesNotMatch(ui.message.textContent, /Could not fetch|versão mais recente/i);
  assert.equal(ui.installButton.hidden, true);
});

test("erro de conexão e falha interna são mensagens diferentes e seguras", async () => {
  const offline = setup({ check: Error("Network error: DNS failed https://private.example") });
  await offline.check();
  assert.match(offline.message.textContent, /Verifique a internet/);
  assert.doesNotMatch(offline.message.textContent, /private.example/);
  const generic = setup({ check: Error("runtime internal panic SECRET") });
  await generic.check();
  assert.match(generic.message.textContent, /Tente novamente/);
  assert.doesNotMatch(generic.message.textContent, /SECRET/);
});

test("versão unsigned mostra exigência de assinatura", async () => {
  const ui = setup({ check: Error("Atualizações estarão disponíveis na versão assinada do BZtune") });
  await ui.check();
  assert.match(ui.message.textContent, /compilação assinada/);
  assert.equal(ui.checkButton.disabled, false);
});

test("nenhuma atualização não é tratada como erro", async () => {
  const ui = setup();
  await ui.check();
  assert.match(ui.message.textContent, /Nenhuma versão mais nova/);
});

test("versão disponível mantém botão e destaque", async () => {
  const ui = setup({ check: { version: "2.0.4", notes: "Ajustes de player" } });
  await ui.check();
  assert.equal(ui.installButton.hidden, false);
  assert.match(ui.toggle.textContent, /2\.0\.4/);
  assert.equal(ui.toggle.classList.contains("has-update"), true);
});

test("falha de assinatura no instalador oculta dados internos", async () => {
  const ui = setup({ check: { version: "2.0.4" }, installError: "Invalid signature of update" });
  await ui.check();
  ui.installButton.click();
  await ui.flush();
  assert.match(ui.message.textContent, /assinatura de segurança/);
  assert.doesNotMatch(ui.message.textContent, /Invalid signature/);
  assert.equal(ui.installButton.hidden, true);
});

test("consulta automática não abre a central", async () => {
  const ui = setup({ check: Error("Could not fetch a valid release JSON from the remote") });
  await ui.autoCheck();
  assert.equal(ui.panel.hidden, true);
  assert.equal(ui.checkButton.disabled, false);
});

test("timeout nativo da consulta libera a central e permite nova verificação", async () => {
  let calls = 0;
  let rejectCheck;
  const ui = setup({ check: () => {
    calls++;
    return calls === 1 ? new Promise((_, reject) => { rejectCheck = reject; }) : { version: "2.0.4" };
  } });
  await ui.flush();
  ui.checkButton.click();
  assert.equal(ui.checkButton.disabled, true);
  assert.equal(ui.installButton.disabled, true);
  ui.checkButton.click();
  assert.equal(calls, 1, "ignora consultas concorrentes enquanto aguarda o nativo");
  rejectCheck(Error("BZTUNE_UPDATE_CHECK_TIMEOUT"));
  await ui.flush();
  assert.match(ui.message.textContent, /consulta.*tempo limite/i);
  assert.doesNotMatch(ui.message.textContent, /BZTUNE_UPDATE/);
  assert.equal(ui.checkButton.disabled, false);
  assert.equal(ui.installButton.disabled, false);
  assert.equal(ui.installButton.hidden, true);
  await ui.check();
  assert.equal(calls, 2);
  assert.equal(ui.installButton.hidden, false);
});

test("timeout do download remove a oferta e permite buscar e instalar novamente", async () => {
  let calls = 0;
  let rejectDownload;
  const ui = setup({ check: { version: "2.0.4" }, install: () => {
    calls++;
    return calls === 1 ? new Promise((_, reject) => { rejectDownload = reject; }) : undefined;
  } });
  await ui.check();
  ui.installButton.click();
  assert.equal(ui.checkButton.disabled, true);
  assert.equal(ui.progress.hidden, false);
  rejectDownload(Error("BZTUNE_UPDATE_DOWNLOAD_TIMEOUT"));
  await ui.flush();
  assert.match(ui.message.textContent, /download.*tempo limite.*descartado/i);
  assert.doesNotMatch(ui.message.textContent, /BZTUNE_UPDATE/);
  assert.equal(ui.progress.hidden, true);
  assert.equal(ui.installButton.hidden, true);
  assert.equal(ui.checkButton.disabled, false);
  assert.equal(ui.toggle.classList.contains("has-update"), false);
  ui.installButton.click();
  await ui.flush();
  assert.equal(calls, 1, "sem oferta pendente não inicia outra instalação");
  await ui.check();
  ui.installButton.click();
  await ui.flush();
  assert.equal(calls, 2);
  assert.match(ui.message.textContent, /entregue ao instalador/);
});

test("timeout da consulta automática mantém a janela fechada e libera a busca manual", async () => {
  const ui = setup({ check: Error("BZTUNE_UPDATE_CHECK_TIMEOUT") });
  await ui.autoCheck();
  assert.equal(ui.panel.hidden, true);
  assert.equal(ui.checkButton.disabled, false);
  assert.match(ui.message.textContent, /consulta.*tempo limite/i);
});

test("aguarda a restauração do backend e só então libera uma nova tentativa", async () => {
  let rejectInstall;
  const ui = setup({ check: { version: "2.0.4" }, install: () => new Promise((_, reject) => { rejectInstall = reject; }) });
  await ui.check();
  ui.installButton.click();
  ui.emit("bztune-backend-restoring", true);
  assert.match(ui.message.textContent, /Restaurando o serviço local/);
  assert.equal(ui.checkButton.disabled, true);
  assert.equal(ui.progress.hidden, true);
  const restoringMessage = ui.message.textContent;
  ui.emit("bztune-update-progress", [50, 100]);
  ui.emit("bztune-update-finished", true);
  assert.equal(ui.message.textContent, restoringMessage);
  rejectInstall(Error("BZTUNE_UPDATE_BACKEND_RESTORED"));
  await ui.flush();
  assert.match(ui.message.textContent, /serviço local foi restaurado/);
  assert.doesNotMatch(ui.message.textContent, /BZTUNE_UPDATE/);
  assert.equal(ui.checkButton.disabled, false);
  assert.equal(ui.installButton.hidden, true);
  await ui.check();
  assert.equal(ui.installButton.hidden, false);
});

test("falha da recuperação informa indisponibilidade sem anunciar biblioteca restaurada", async () => {
  const ui = setup({ check: { version: "2.0.4" }, installError: "BZTUNE_UPDATE_BACKEND_UNAVAILABLE" });
  await ui.check();
  ui.installButton.click();
  await ui.flush();
  assert.match(ui.message.textContent, /Feche e abra o BZtune/);
  assert.match(ui.stage.textContent, /biblioteca está temporariamente indisponível/);
  assert.doesNotMatch(ui.message.textContent, /foi restaurado|BZTUNE_UPDATE/);
  assert.equal(ui.installButton.hidden, true);
  assert.equal(ui.checkButton.disabled, false);
});

test("download concluído anuncia validação e só o evento verificado prepara o instalador", async () => {
  let finishInstall;
  const ui = setup({ check: { version: "2.0.4" }, install: () => new Promise(resolve => { finishInstall = resolve; }) });
  await ui.check();
  ui.installButton.click();
  ui.emit("bztune-update-progress", [50, 100]);
  assert.equal(ui.progress.value, 50);
  ui.emit("bztune-update-finished", true);
  assert.match(ui.message.textContent, /Download concluído.*Verificando a assinatura/);
  assert.doesNotMatch(ui.message.textContent, /Preparando|entregue|Assinatura verificada/);
  assert.equal(ui.checkButton.disabled, true);
  const verifying = ui.message.textContent;
  ui.emit("bztune-update-progress", [10, 100]);
  assert.equal(ui.message.textContent, verifying);
  ui.emit("bztune-update-verified", true);
  assert.match(ui.message.textContent, /Assinatura verificada.*abertura do instalador/);
  assert.doesNotMatch(ui.message.textContent, /entregue/);
  const preparing = ui.message.textContent;
  ui.emit("bztune-update-finished", true);
  ui.emit("bztune-update-progress", [80, 100]);
  assert.equal(ui.message.textContent, preparing);
  assert.equal(ui.checkButton.disabled, true);
  finishInstall();
  await ui.flush();
  assert.match(ui.message.textContent, /entregue ao instalador/);
  const delivered = ui.message.textContent;
  ui.emit("bztune-update-verified", true);
  assert.equal(ui.message.textContent, delivered);
});

test("assinatura rejeitada após baixar nunca anuncia assinatura verificada ou entrega", async () => {
  let rejectInstall;
  const ui = setup({ check: { version: "2.0.4" }, install: () => new Promise((_, reject) => { rejectInstall = reject; }) });
  await ui.check();
  ui.installButton.click();
  ui.emit("bztune-update-finished", true);
  assert.match(ui.message.textContent, /Verificando a assinatura/);
  rejectInstall(Error("Invalid signature of update"));
  await ui.flush();
  assert.match(ui.message.textContent, /Não foi possível confirmar a assinatura/);
  assert.doesNotMatch(ui.message.textContent, /Preparando|Assinatura verificada|entregue/);
  assert.equal(ui.progress.hidden, true);
  assert.equal(ui.installButton.hidden, true);
  const rejected = ui.message.textContent;
  ui.emit("bztune-update-verified", true);
  ui.emit("bztune-update-finished", true);
  assert.equal(ui.message.textContent, rejected);
  await ui.check();
  const checked = ui.message.textContent;
  ui.emit("bztune-update-verified", true);
  assert.equal(ui.message.textContent, checked);
});

test("confirmação nativa continua válida se o aviso de fim do download não chegou", async () => {
  const ui = setup({ check: { version: "2.0.4" }, install: () => new Promise(() => {}) });
  await ui.check();
  ui.installButton.click();
  ui.emit("bztune-update-verified", true);
  assert.match(ui.message.textContent, /Assinatura verificada/);
  assert.equal(ui.checkButton.disabled, true);
});

for (const channel of ["preview", "local", "public", "custom", "unconfigured"]) {
  test(`canal ${channel} informa versão real e bloqueia consultas quando desabilitado`, async () => {
    const enabled = ["local", "public", "custom"].includes(channel);
    const ui = setup({ status: { version: "2.0.5", channel, enabled } });
    assert.equal(ui.checkButton.disabled, true, "bloqueado até identificar capacidade");
    await ui.flush();
    assert.equal(ui.panel.querySelector("#bztune-current-version").textContent, "Versão instalada: 2.0.5");
    assert.equal(ui.checkButton.disabled, !enabled);
    assert.match(ui.panel.querySelector("#bztune-update-channel").textContent,
      { preview: /Preview/, local: /Teste local/, public: /Canal público/, custom: /personalizado/, unconfigured: /não configurado/ }[channel]);
    await ui.autoCheck();
    await ui.check();
    assert.equal(ui.calls.filter(c => c === "desktop_check_update").length, enabled ? 2 : 0);
    assert.equal(ui.installButton.hidden, true);
    assert.equal(ui.panel.hidden, true);
  });
}

test("falha ao identificar canal permite repetir sem consultar ou instalar", async () => {
  let attempts = 0;
  const ui = setup({ status: () => {
    if (++attempts === 1) throw Error("SECRET internal URL");
    return { version: "2.0.5", channel: "public", enabled: true };
  } });
  await ui.flush();
  assert.match(ui.message.textContent, /Não foi possível identificar/);
  assert.doesNotMatch(ui.message.textContent, /SECRET/);
  assert.equal(ui.checkButton.disabled, false);
  assert.equal(ui.checkButton.textContent, "Tentar novamente");
  await ui.check();
  assert.equal(attempts, 2);
  assert.equal(ui.calls.includes("desktop_check_update"), false);
  await ui.check();
  assert.equal(ui.calls.filter(c => c === "desktop_check_update").length, 1);
});

test("estado nativo incoerente não habilita consulta automática", async () => {
  const ui = setup({ status: { version: "2.0.5", channel: "preview", enabled: true } });
  await ui.autoCheck();
  assert.equal(ui.calls.includes("desktop_check_update"), false);
  assert.match(ui.message.textContent, /Não foi possível identificar/);
});

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

function setup({ check = null, installError = null } = {}) {
  const root = new Element(), panel = new Element(), slot = new Element();
  const timers = [];
  const invoke = async command => {
    if (command === "desktop_version") return "2.0.3";
    if (command === "desktop_check_update") {
      if (check instanceof Error) throw check;
      return check;
    }
    if (command === "desktop_install_update") {
      if (installError) throw Error(installError);
      return;
    }
    throw Error("Comando inesperado: " + command);
  };
  const document = {
    head: new Element(), body: new Element(),
    createElement: tag => tag === "section" ? panel : new Element(),
    getElementById: key => ({ root, "bztune-desktop-update-slot": slot })[key] ?? null,
  };
  const window = {
    __TAURI__: { core: { invoke }, event: { listen: async () => {} } },
    setTimeout: (fn, ms) => { timers.push({ fn, ms }); return timers.length; },
    clearTimeout() {},
  };
  vm.runInNewContext(source, { window, document });
  const message = panel.querySelector("#bztune-update-message");
  const checkButton = panel.querySelector("#bztune-check");
  const installButton = panel.querySelector("#bztune-install");
  const flush = () => new Promise(resolve => setImmediate(resolve));
  return {
    message, panel, checkButton, installButton, toggle: slot.children[0],
    async check() { checkButton.click(); await flush(); },
    async autoCheck() {
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
  assert.match(ui.message.textContent, /versão mais recente/);
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

import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import AppErrorBoundary from "./AppErrorBoundary";
import { applyAppearance, loadPreferences } from "./settings/AppearanceContext";
import "./styles.css";

type NativeApi = { invoke: (command: string) => Promise<unknown> };
// Apply the saved theme before boot screens or React's first frame.
applyAppearance(loadPreferences(), typeof window.matchMedia === "function"
  ? window.matchMedia("(prefers-color-scheme: dark)").matches : true);
const rootNode = document.getElementById("root")!;
const native = (window as Window & { __TAURI__?: { core?: NativeApi } }).__TAURI__?.core;

function mountApplication() {
  createRoot(rootNode).render(
    <React.StrictMode>
      <AppErrorBoundary><App /></AppErrorBoundary>
    </React.StrictMode>,
  );
}

function statusScreen(message: string, canRetry: boolean) {
  rootNode.replaceChildren();
  const container = document.createElement("main");
  container.setAttribute("role", "status");
  container.style.cssText = "min-height:100vh;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:calc(20px * var(--bz-ui-space-scale,1));background:var(--bg,#111);color:var(--white,#eee);font:1rem system-ui;text-align:center;padding:calc(32px * var(--bz-ui-space-scale,1))";
  const title = document.createElement("strong");
  title.textContent = "BZtune Desktop";
  title.style.cssText = "font-size:1.5rem";
  const detail = document.createElement("p");
  detail.textContent = message;
  detail.style.cssText = "max-width:600px;line-height:1.6";
  container.append(title, detail);
  if (canRetry) {
    const retry = document.createElement("button");
    retry.textContent = "Verificar conexão novamente";
    retry.style.cssText = "border:1px solid var(--accent-focus,#b6e875);border-radius:calc(9px * var(--bz-ui-corner-scale,1));padding:calc(11px * var(--bz-ui-space-scale,1)) calc(18px * var(--bz-ui-space-scale,1));min-height:44px;background:var(--panel2,#232923);color:var(--white,#ecf7e5);cursor:pointer";
    retry.addEventListener("click", () => { void desktopBoot(); });
    container.append(retry);
  }
  rootNode.append(container);
}

const sleep = (ms: number) => new Promise<void>((resolve) => window.setTimeout(resolve, ms));

async function desktopBoot() {
  if (!native?.invoke) {
    mountApplication(); // Web e Vite continuam funcionando sem Tauri ou sidecar.
    return;
  }
  statusScreen("Inicializando a biblioteca e verificando a API local...", false);
  const until = Date.now() + 45000;
  while (Date.now() < until) {
    try {
      if (await native.invoke("desktop_backend_ready") === true) {
        // A sonda nativa valida o servidor. Esta consulta valida o fetch do WebView2,
        // incluindo CORS e acesso à rede local, antes de montar todas as telas React.
        const controller = new AbortController();
        const timeout = window.setTimeout(() => controller.abort(), 5000);
        try {
          const response = await fetch("http://127.0.0.1:5000/api/bztune/stats/summary?period=month", {
            mode: "cors",
            cache: "no-store",
            signal: controller.signal,
          });
          if (!response.ok) throw new Error(`API HTTP ${response.status}`);
          mountApplication();
          return;
        } catch {
          statusScreen("O serviço iniciou, mas o aplicativo não conseguiu se conectar. Verifique as permissões de rede local e tente novamente. Seus arquivos foram preservados.", true);
          return;
        } finally {
          window.clearTimeout(timeout);
        }
      }
    } catch {
      // O comando pode não estar disponível nos primeiros instantes do WebView.
    }
    await sleep(350);
  }
  statusScreen("O serviço local não ficou pronto dentro de 45 segundos. Feche e abra o BZtune novamente. Seus dados foram preservados.", true);
}

void desktopBoot();

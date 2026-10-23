/** Regression: an online failure must be visible and its retry button clickable. */
const assert = require("node:assert/strict");
const path = require("node:path");
const { createRequire } = require("node:module");
const frontendRequire = createRequire(path.resolve(__dirname, "../../doomvault/package.json"));
const { chromium } = frontendRequire("playwright");
const { fixture } = require("./frontend-contracts.cjs");

const API = "http://127.0.0.1:5000";
const BASE = process.env.BZTUNE_BASE_URL || "http://127.0.0.1:5173";
const summary = { totals: {}, artists: [], tracks: [], albums: [], daily: [], history: [] };
const adapter = `
window.YT = { Player: class {
  constructor(element, options) {
    this.options = options;
    setTimeout(() => options.events.onReady({ target: this }), 10);
  }
  setVolume() {}
  playVideo() { this.options.events.onStateChange({ data: 1 }); }
  pauseVideo() { this.options.events.onStateChange({ data: 2 }); }
  getCurrentTime() { return 0; }
  getDuration() { return 100; }
  seekTo() {}
  destroy() {}
}};
window.onYouTubeIframeAPIReady();`;

async function expandedRecovery(browser) {
  for (const [width, height, large, view] of [
    [1360, 870], [960, 640], [390, 844], [320, 640], [1024, 640, true],
    [1360, 870, false, "overview"], [320, 640, false, "overview"], [1360, 870, false, "queue"],
  ]) {
    const f = await fixture(browser, { width, height, seed: {
      "bztune-settings-v1": JSON.stringify({ startPage: "home", theme: "midnight", autoUpdates: false,
        fontSize: large ? "large" : "medium", density: large ? "spacious" : "normal" }),
    }, override: async (route, url) => {
      if (url.pathname.endsWith("/discovery/alternatives")) {
        await route.fulfill({ json: { tracks: Array.from({ length: 9 }, (_, i) => ({
          videoId: `alternate0${i}`, title: `Outra gravação ${i + 1}`, artist: "Artista de Teste",
        })) } });
        return true;
      }
    } });
    const page = f.page;
    try {
      await page.getByRole("button", { name: "Expandir player", exact: true }).click();
      const footer = page.getByRole("toolbar", { name: "Ferramentas do player expandido" });
      if (view === "overview") await footer.getByRole("button", { name: "Letra", exact: true }).click();
      if (view === "queue") await footer.getByRole("button", { name: "Fila", exact: true }).click();
      const footerBefore = await footer.boundingBox();
      await page.evaluate(() => { window.originalRecoveryVideo = document.querySelector(".bz32-video"); });
      const queueBefore = await page.evaluate(() => localStorage.getItem("doomvault-player-state-v11"));
      await page.getByRole("button", { name: "Vídeo não reproduz? Ver alternativas", exact: true }).click();
      const recovery = page.getByRole("region", { name: "Alternativas de reprodução", exact: true });
      await recovery.waitFor();
      const geometry = await recovery.evaluate(element => {
        const media = element.closest(".bz32-media").getBoundingClientRect();
        const surface = element.parentElement.getBoundingClientRect();
        const controls = document.querySelector(".bz32-center").getBoundingClientRect();
        return { mediaBottom: media.bottom, surfaceBottom: surface.bottom,
          overlapsControls: surface.left < controls.right && surface.right > controls.left
            && surface.top < controls.bottom && surface.bottom > controls.top };
      });
      assert.ok(geometry.mediaBottom >= geometry.surfaceBottom - 1, `Recovery escapes media at ${width}px: ${JSON.stringify(geometry)}`);
      assert.equal(geometry.overlapsControls, false, `Recovery overlaps controls at ${width}px`);
      await recovery.getByRole("button", { name: "Tentar reprodução novamente", exact: true }).click({ trial: true });
      await recovery.getByRole("link", { name: "Ver vídeo no YouTube", exact: true }).click({ trial: true });
      // A normal click must work; forcing a click would hide the overlap regression.
      await recovery.getByRole("button", { name: "Procurar outra gravação", exact: true }).click();
      const candidates = recovery.locator(".bz-online-recovery-results > button");
      await candidates.last().waitFor();
      assert.equal(await candidates.count(), 9);
      for (const candidate of await candidates.all()) await candidate.click({ trial: true });
      const footerAfter = await footer.boundingBox();
      assert.equal(footerAfter.y, footerBefore.y, "Recovery scrolling must not move the footer");
      assert.equal(footerAfter.height, footerBefore.height);
      await recovery.getByRole("button", { name: "Fechar alternativas", exact: true }).click();
      assert.equal(await recovery.count(), 0);
      assert.equal(await page.evaluate(() => window.originalRecoveryVideo === document.querySelector(".bz32-video")), true);
      assert.equal(await page.evaluate(() => localStorage.getItem("doomvault-player-state-v11")), queueBefore);
      assert.deepEqual(f.errors, []);
      console.log(`PASS expanded recovery: all actions clickable, controls separated, footer and video retained at ${width}x${height}${large ? " large/spacious" : ""} ${view || "lyrics"}`);
    } finally {
      await page.close();
    }
  }
}

async function main() {
  const browser = await chromium.launch({
    ...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}),
    args: ["--no-sandbox"],
  });
  try {
    const page = await browser.newPage({ viewport: { width: 1360, height: 870 } });
    const errors = [];
    let attempts = 0;
    page.on("pageerror", error => errors.push(error.message));
    await page.addInitScript(() => {
      localStorage.clear();
      localStorage.setItem("bztune-settings-v1", JSON.stringify({ startPage: "home", autoUpdates: false }));
      localStorage.setItem("doomvault-player-state-v11", JSON.stringify({
        tracks: [{ videoId: "abcdefghijk", title: "Song", artist: "Artist", album: "Studio" }],
        index: 0, shuffle: false, repeat: "off",
      }));
    });
    await page.route("https://fonts.googleapis.com/**", route => route.abort());
    await page.route("https://www.youtube.com/iframe_api", route => {
      attempts++;
      return attempts === 1 ? route.abort() : route.fulfill({ contentType: "application/javascript", body: adapter });
    });
    await page.route(`${API}/**`, route => {
      const pathname = new URL(route.request().url()).pathname;
      let json = {};
      if (pathname === "/api/library/tracks") {
        json = { tracks: [{ id: "live", title: "Song", artist: "Artist", album: "Live", audioUrl: "/media/live" }] };
      } else if (pathname === "/api/library/albums") json = { albums: [] };
      else if (pathname === "/api/playlists") json = { playlists: [] };
      else if (pathname === "/api/genres/index") json = { genres: [] };
      else if (pathname.includes("/stats/summary")) json = summary;
      else if (pathname.includes("/stats/wrapped")) json = { topArtists: [], months: [] };
      else if (pathname.includes("/maintenance/diagnostics")) json = { packages: {}, ffmpeg: {} };
      else if (pathname.includes("/discovery/recommendations")) json = { songs: [], albums: [], artists: [] };
      return route.fulfill({ json });
    });
    await page.goto(BASE);
    const error = page.getByRole("alert").filter({ hasText: "Falha ao carregar o player do YouTube." });
    await error.waitFor();
    // A normal click detects overlays intercepting the pointer; never use force.
    await error.getByRole("button", { name: "Tentar reprodução novamente", exact: true }).click();
    await page.getByRole("button", { name: "Pausar", exact: true }).waitFor();
    await page.waitForFunction(() => !!document.querySelector(".bz32-mini-play:not(:disabled)"));
    assert.equal(attempts, 2);
    assert.equal(await page.locator("audio").evaluateAll(elements => elements.some(element => element.getAttribute("src"))), false);
    // The help belongs below the visible YouTube surface, never over its controls.
    for (const width of [1360, 1024, 390, 320]) {
      await page.setViewportSize({ width, height: 870 });
      const bounds = await page.locator(".bz-online-mini-help").evaluate(button => {
        const video = document.querySelector(".bz32-media-surface").getBoundingClientRect();
        const media = button.parentElement.getBoundingClientRect();
        const help = button.getBoundingClientRect();
        const bar = document.querySelector(".bz32-minibar").getBoundingClientRect();
        return { top: help.top, bottom: help.bottom, left: media.left, right: media.right,
          videoBottom: video.bottom, videoWidth: video.width, videoHeight: video.height,
          mediaBottom: media.bottom, barTop: bar.top, height: help.height,
          fitsText: button.scrollWidth <= button.clientWidth && button.scrollHeight <= button.clientHeight };
      });
      assert.ok(bounds.top >= bounds.videoBottom - 1, `Help overlaps video at ${width}px`);
      assert.ok(bounds.bottom <= bounds.mediaBottom + 1 && bounds.bottom < bounds.barTop, `Help overlaps mini-player at ${width}px: ${JSON.stringify(bounds)}`);
      assert.ok(bounds.left >= 0 && bounds.right <= width, `Floating panel exceeds ${width}px`);
      assert.ok(bounds.videoWidth >= 200 && bounds.videoHeight >= 200, "YouTube remains visible");
      assert.ok(bounds.height >= 44 && bounds.fitsText, "Help text and click target must fit");
    }
    await page.setViewportSize({ width: 1360, height: 870 });
    await page.evaluate(() => { window.originalVideoSurface = document.querySelector(".bz32-video"); });
    await page.locator(".bz-online-mini-help").click();
    await page.getByRole("region", { name: "Alternativas de reprodução", exact: true }).waitFor();
    await page.getByRole("button", { name: "Minimizar para o mini-player", exact: true }).click();
    await page.locator(".bz-online-mini-help").waitFor();
    assert.equal(await page.evaluate(() => window.originalVideoSurface === document.querySelector(".bz32-video")), true);
    assert.equal(attempts, 2);
    assert.deepEqual(errors, []);
    console.log("OK: falha online visível; nova tentativa clicável; Studio não foi substituído por Live.");
    await page.close();
    await expandedRecovery(browser);
  } finally {
    await browser.close();
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });

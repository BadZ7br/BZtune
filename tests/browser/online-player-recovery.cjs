/** Regression: an online failure must be visible and its retry button clickable. */
const assert = require("node:assert/strict");
const path = require("node:path");
const { createRequire } = require("node:module");
const frontendRequire = createRequire(path.resolve(__dirname, "../../doomvault/package.json"));
const { chromium } = frontendRequire("playwright");

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
    assert.deepEqual(errors, []);
    console.log("OK: falha online visível; nova tentativa clicável; Studio não foi substituído por Live.");
  } finally {
    await browser.close();
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });

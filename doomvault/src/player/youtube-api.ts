/** YouTube API lifecycle; shared promise and cleanup belong to this adapter. */
export type YTPlayer = {
  playVideo: () => void; pauseVideo: () => void;
  seekTo: (seconds: number, allowSeekAhead: boolean) => void;
  getCurrentTime: () => number; getDuration: () => number;
  setVolume: (volume: number) => void; destroy: () => void;
};
type YTApi = { Player: new (element: HTMLElement, options: object) => YTPlayer };
declare global {
  interface Window { YT?: YTApi; onYouTubeIframeAPIReady?: () => void; }
}
let ytPromise: Promise<YTApi> | null = null;
export function loadYouTubeApi(): Promise<YTApi> {
  if (window.YT?.Player) return Promise.resolve(window.YT);
  if (ytPromise) return ytPromise;
  ytPromise = new Promise<YTApi>((resolve, reject) => {
    const previous = window.onYouTubeIframeAPIReady;
    const src = "https://www.youtube.com/iframe_api";
    let tag = document.querySelector<HTMLScriptElement>(`script[src="${src}"]`);
    const finish = (error?: Error) => {
      window.clearTimeout(timer);
      if (window.onYouTubeIframeAPIReady === onReady) window.onYouTubeIframeAPIReady = previous;
      tag?.removeEventListener("error", onError);
      if (error) { tag?.remove(); reject(error); }
      else resolve(window.YT!);
    };
    const onReady = () => {
      try { previous?.(); } finally {
        finish(window.YT?.Player ? undefined : new Error("API do YouTube não carregou"));
      }
    };
    const onError = () => finish(new Error("Não foi possível carregar o player do YouTube"));
    const timer = window.setTimeout(() => finish(new Error("O YouTube não respondeu em 15 segundos")), 15000);
    window.onYouTubeIframeAPIReady = onReady;
    if (!tag) { tag = document.createElement("script"); tag.src = src; document.head.appendChild(tag); }
    tag.addEventListener("error", onError, { once: true });
  }).catch((error: unknown) => { ytPromise = null; throw error; });
  return ytPromise;
}

export function ytError(code: number) {
  if (code === 101 || code === 150) return "Este vídeo não permite reprodução incorporada.";
  if (code === 100) return "Vídeo indisponível ou removido.";
  if (code === 153) return "O YouTube não conseguiu identificar o aplicativo.";
  if (code === 5) return "Falha do player HTML5 do YouTube.";
  return `Falha do YouTube (código ${code}).`;
}

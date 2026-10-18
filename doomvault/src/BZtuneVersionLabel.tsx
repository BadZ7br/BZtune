import { useEffect, useState } from "react";

/**
 * Versão mostrada na interface, sem duplicar números de versão antigos.
 * No Desktop usa o mesmo comando do atualizador; na web exibe "Web".
 *
 * Não renomear chaves históricas em localStorage/SQLite nesta migração:
 * elas preservam favoritos, reprodução e playlists entre atualizações.
 */
export default function BZtuneVersionLabel() {
  const [label, setLabel] = useState("Desktop");

  useEffect(() => {
    const bridge = (window as Window & {
      __TAURI__?: { core?: { invoke?: (cmd: string) => Promise<unknown> } };
    }).__TAURI__?.core;

    if (!bridge?.invoke) {
      setLabel("Web");
      return;
    }

    let mounted = true;
    void bridge.invoke("desktop_version")
      .then((version: unknown) => {
        if (mounted && typeof version === "string" &&
          /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(version)) {
          setLabel(`v${version}`);
        }
      })
      .catch(() => {
        // A interface permanece utilizável se a ponte Tauri falhar.
      });

    return () => { mounted = false; };
  }, []);

  return <span aria-label={`Versão do BZtune: ${label}`}>{label}</span>;
}

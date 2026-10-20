import { useEffect, useState } from "react";
import { retryStorage, unsavedStorage } from "./services/storage";
export default function StorageSaveNotice() {
  const [unsaved, setUnsaved] = useState(unsavedStorage);
  useEffect(() => {
    const changed = () => setUnsaved(unsavedStorage());
    window.addEventListener("bztune-storage-status", changed);
    changed();
    return () => window.removeEventListener("bztune-storage-status", changed);
  }, []);
  return unsaved ? <aside className="bz-preference-save-warning" role="alert">
    <div><strong>Há alterações salvas apenas nesta sessão.</strong><p>O armazenamento está indisponível. Tente salvar antes de fechar o aplicativo.</p></div>
    <button type="button" onClick={retryStorage}>Tentar salvar novamente</button>
  </aside> : null;
}

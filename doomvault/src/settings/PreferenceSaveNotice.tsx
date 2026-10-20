import { useEffect, useState } from "react";
import { useAppearance } from "./AppearanceContext";

export default function PreferenceSaveNotice() {
  const { preferences, saveError, retrySave } = useAppearance();
  const [feedback, setFeedback] = useState("");
  useEffect(() => { setFeedback(""); }, [preferences]);

  return <>
    {saveError && <aside className="bz-preference-save-warning">
      <div role="alert">
        <strong>Não foi possível salvar suas preferências.</strong>
        <p>As alterações continuam funcionando nesta sessão, mas podem ser perdidas ao fechar o aplicativo.</p>
      </div>
      <button type="button" onClick={() => setFeedback(retrySave()
        ? "Preferências salvas."
        : "A gravação continua indisponível. Suas escolhas ainda valem apenas nesta sessão.")}>Tentar salvar novamente</button>
    </aside>}
    <p className="bz-preference-save-feedback" role="status">{feedback}</p>
  </>;
}

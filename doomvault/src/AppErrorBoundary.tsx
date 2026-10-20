import { Component, type ReactNode } from "react";
/** Last resort: preserve an actionable screen instead of an empty React root. */
export default class AppErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() {
    if (!this.state.failed) return this.props.children;
    return <main className="bz-app-recovery" role="alert">
      <h1>Não foi possível exibir esta tela</h1>
      <p>Sua biblioteca não foi apagada. Você pode tentar abrir o aplicativo novamente.</p>
      <button type="button" onClick={() => window.location.reload()}>Reabrir o BZtune</button>
    </main>;
  }
}

import { Component, type ReactNode } from "react";

/** A hidden area must never replace the navigation or stop a healthy player. */
export default class AreaErrorBoundary extends Component<{ name: string; children: ReactNode; onBack?: () => void }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() {
    if (!this.state.failed) return this.props.children;
    return <section className="bz-area-recovery" role="alert" aria-label={`Falha em ${this.props.name}`}>
      <h2>Não foi possível exibir {this.props.name}</h2>
      <p>As outras áreas continuam disponíveis. Tente abrir esta área novamente.</p>
      <button type="button" onClick={() => this.setState({ failed: false })}>Tentar abrir {this.props.name} novamente</button>
      {this.props.onBack && <button type="button" onClick={this.props.onBack}>Voltar</button>}
    </section>;
  }
}

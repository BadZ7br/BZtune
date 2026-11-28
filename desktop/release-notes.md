BZtune Desktop 2.0.14 — correção de segurança no serviço local.

- O serviço local passa a atender apenas os endereços 127.0.0.1 e localhost; outros nomes são recusados, o que protege contra ataques de DNS rebinding.
- Novo teste automático para essa proteção.

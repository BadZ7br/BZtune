# Inventário da reorganização

| Elemento | Antes | Depois |
|---|---:|---:|
| Arquivos CSS | 22 | 1 (`doomvault/src/styles.css`) |
| Arquivos Python de blueprint na raiz do backend | 5 completos | 5 adaptadores e implementação em `api/` |
| Serviços Python na raiz do backend | 2 completos | 2 adaptadores e implementação em `services/` |
| Páginas React soltas em `src/` | 5 + 1 legado | `src/pages/` + `src/legacy/` |
| Bibliotecas `api.ts` e `music-utils.ts` | `src/` | `src/services/` e `src/utils/` |
| Catálogo estático (legado) | `src/` | `src/catalog/` |
| `package-lock.json` vazio na raiz | 1 | removido; preservado `doomvault/package-lock.json` |

**Método CSS:** concatenação por ordem de dependências, com marcadores de origem. Não foi feita deduplicação automática de seletores, pois isso poderia afetar a aparência aprovada.

**Backend:** o `app.py` continua monolítico; desmontar todas as suas rotas será uma etapa posterior, após testes Flask com dependências reais.

**Build:** a validação de imports e sintaxe foi feita offline; execute `npm run build` no Windows para conferir o TypeScript e o Vite no ambiente original.

# DoomVault

DoomVault é um protótipo de explorador musical feito com React, TypeScript e Vite. O objetivo é praticar desenvolvimento web construindo uma biblioteca de álbuns, filtros, favoritos e uma coleção pessoal.

## Requisitos

- Node.js em uma versão LTS recente
- npm (incluído com o Node.js)

## Executar localmente

1. Extraia o arquivo ZIP.
2. Abra a pasta `doomvault` no VS Code.
3. Abra o terminal integrado.
4. Execute:

```bash
npm install
npm run dev
```

5. Abra no navegador o endereço local indicado pelo Vite (normalmente `http://localhost:5173`).

## Funcionalidades desta versão

- Navegação entre Descobrir, Álbuns e Minha coleção.
- Busca por título, artista, gênero ou atmosfera.
- Filtros de gênero e clima.
- Favoritos salvos no `localStorage`.
- Coleção pessoal salva no `localStorage`.
- Links de busca para Spotify e YouTube.
- Layout responsivo para celular e computador.

## Aprendizado sugerido

1. Abra `src/data.ts` e adicione um álbum.
2. Em `src/App.tsx`, encontre a função `toggleFavorite` e entenda como ela adiciona ou remove IDs.
3. Teste a busca e os filtros.
4. Abra `src/styles.css` e altere as variáveis de cores.
5. Execute `npm run build` para conferir se o projeto compila.

## Importante

As capas desta primeira versão são artes gráficas feitas com CSS, não capas oficiais. Os dados iniciais são exemplos de catálogo para desenvolvimento. Favoritos e coleção ficam no navegador atual e ainda não sincronizam entre dispositivos. Os links de Spotify e YouTube abrem buscas, não garantem uma faixa específica.

## Próximas etapas

- Adicionar página de detalhes de banda e discografia.
- Integrar uma fonte de metadados musicais com atribuição e respeito aos termos de uso.
- Criar testes para busca, filtros e coleção.
- Melhorar documentação e publicar uma demonstração.

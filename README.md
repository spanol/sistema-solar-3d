# Sistema Solar 3D

App web de visualização interativa do sistema solar.

## Visão do produto
- **Vista superior** (top-down) ao abrir — todos os planetas em órbita.
- **Selecionar um planeta** → transição animada para vista frontal direta.
- **Card de fatos curiosos** à esquerda do planeta selecionado.
- Referência: https://astronomiasemplice.it/sistema-solare-3d

## Stack
- [Vite](https://vitejs.dev/) — dev server / build
- [Three.js](https://threejs.org/) — 3D/WebGL
- JSON local em `src/data/planets.json`

## Como rodar

```bash
# Instalar dependências
npm install

# Subir o servidor de desenvolvimento
npm run dev
```

Abra `http://localhost:5173` no navegador.

## Build de produção

```bash
npm run build
npm run preview
```

## Créditos de texturas

As texturas 2K dos planetas e do Sol em `public/textures/` provêm do pack **Solar System Scope Textures**:

> © Solar System Scope — [solarsystemscope.com/textures](https://www.solarsystemscope.com/textures/)  
> Licença: [CC Attribution 4.0 International](https://creativecommons.org/licenses/by/4.0/)

Texturas incluídas: Sol, Mercúrio, Vênus (superfície), Terra (mapa diurno), Marte, Júpiter, Saturno, anel de Saturno (alpha), Urano, Netuno.

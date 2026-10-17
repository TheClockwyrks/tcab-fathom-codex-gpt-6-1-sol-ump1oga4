# Fathom

A bioluminescent maze chase in the deep sea. Graze plankton, read the corridors with sonar, and evade three hunters that track light and sound. In this **Kindle** dive, explored terrain remains in memory, but only the circular window around your forager is visible. Eating makes that window grow—and makes you easier to hunt.

## Run

Requires Node.js compatible with Vite 8.

```sh
npm ci
npm run dev
```

Open the local URL Vite prints. The game works with a keyboard or the engine's touch controls. All artwork ships locally; no account or backend is required.

## Controls

| Input | Action |
| --- | --- |
| Arrow keys / WASD | Swim while held; buffer turns at junctions |
| Space | Sonar pulse |
| Shift | Ink cloud |
| P / Escape | Pause or resume |
| M | Toggle sound |
| Up / Down, Enter / Space | Select and confirm menu items |
| Pointer / touch | Select and activate menus |
| Backtick | Diagnostic overlay |

Lanternjaws follow your light and disguise themselves as amber drifters. Gloamfins hear you through rock and ink; take corners to slow them. Flarefish periodically illuminate the maze and chase anything caught in their bloom. Ink blinds the hunters that see. Clear every plankton to descend. You begin with three reserve lives in addition to your current attempt.

## Build and verify

```sh
npm run build
npm run preview
npm run typecheck
npm run lint
npm run format
npm test
```

The complete static site is in `dist/`, with `index.html` at its root. Serve that directory at a server root or beneath a sub-path. Assets resolve relative to the page. No manual copy step is needed.

The Simple 2D engine owns the canvas fit, actions, audio, assets, frame loop and diagnostics. Fathom advances its simulation at 120 ticks per second. Its debug API is returned through `engine.debug`; poses go through `engine.apply`, and snapshots read `engine.state`. Tests use the actual engine with a scripted clock and a Node canvas.

Captured play and the player-facing description are in `showcase/`.

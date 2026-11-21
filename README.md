# ChessHub — free chess: rated bots, friends & analysis

100% static. No server, no build step. Deployable to **GitHub Pages** in two minutes.

Features:
- 🤖 6 rated bots (300 → 1850), all running locally: **Sprout, Pixel, Mira, Jonah, Zara, Odin**.
- 👥 Local two-player and 🌐 online friend play through PeerJS (free WebRTC, no account: host creates a six-letter code, friend joins).
- 🔍 chess.com-style **Game Review**: eval bar, best-move arrow, principal variation, move classifications (Brilliant / Great / Best / Excellent / Good / Inaccuracy / Mistake / Miss / Blunder), tallies per side, per-move accuracy and white/black averages. Keyboard navigation, PGN/FEN import, hint engine. Review and hints are powered by **Stockfish 19** running in a Web Worker.

## Run locally

Open `index.html`, or serve the folder:

```bash
cd chess-website
npx serve .
# or: python -m http.server 8000
```

## Deploy to GitHub Pages

1. Put `index.html`, `styles.css` and `app.js` at the repository root.
2. **Settings → Pages → Deploy from branch → `main` / `/ (root)` → Save**.
3. The site appears at `https://YOUR-USERNAME.github.io/<repo>/`.

`.nojekyll` is included so Pages serves the files as-is.

## Bots and elo

| Bot | Elo |
|-----|-----|
| Sprout | 300 |
| Pixel | 600 |
| Mira | 900 |
| Jonah | 1200 |
| Zara | 1500 |
| Odin | 1850 |

Bots run on the same Stockfish 19 build, limited to their rating with Skill Level / UCI_Elo.

## Engine

- **Evaluation:** material, piece-square tables, tapered king safety with a pawn shield, bishop pair, rooks on open/semi-open files, doubled/isolated/passed pawns, tempo.
- **Search:** negamax alpha-beta with a transposition table, MVV-LVA ordering, killer moves, history heuristic, capture-only quiescence search with delta pruning, and iterative deepening (depth 4 for review, 5 for the top bot) under a time budget.
- **Accuracy:** centipawn eval → win probability (`100 / (1 + e^(-0.0038·cp))`), win-probability loss per move, then `103.1668·e^(-0.04354·Δ) − 3.1669` clamped to 0–100.
- Classification is based on win-probability drop, with Brilliant reserved for sound sacrifices that are also the best move and Great for a forced only-move.

## Stockfish

The site runs **Stockfish 19 lite** (NNUE, single-threaded WebAssembly) locally: `stockfish/stockfish-19-lite-single.js`
and its `.wasm` are served from this repo, started in a Web Worker by `sf-core.js`, and turned into the
Game Review, hint and eval features by `sf-review.js`.

- Single-threaded on purpose. GitHub Pages cannot send `Cross-Origin-Opener-Policy` /
  `Cross-Origin-Embedder-Policy`, so the `SharedArrayBuffer` (multi-threaded) builds would never load.
- **Game Review** has a speed selector in the Analyse panel: ⚡ **Fast** (depth 18, ~0.4 s/move),
  ⚖ **Balanced** (depth 22, ~1.2 s/move, the default) and 🔍 **Deep** (depth 26, ~2.5 s/move).
  A 40-move game takes roughly 15 s, a minute, or two minutes respectively; changing the setting
  mid-review applies from the next position.
- **💡 Hint** searches to depth 24 with a 3.5 s limit.
- **⏹ Stop** ends the running search at once: the review keeps the positions it had already finished
  and the buttons unlock immediately.

## Online play

GitHub Pages cannot run a game server, so friend games use PeerJS cloud signalling for a peer-to-peer WebRTC link. Moves sync directly between the two browsers. Bot play and analysis need no network after the page and its two CDN scripts have loaded.

## Tech

- chess.js 0.10.3 (CDN) for rules
- PeerJS 1.5.4 (CDN) for online play
- Stockfish 19 lite (NNUE WASM, GPLv3, vendored under `stockfish/`) for analysis
- Vanilla JS and CSS for the board, bots and analysis

No tracking, no backend, no API keys.

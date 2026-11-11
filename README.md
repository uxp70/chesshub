# ChessHub — free chess: rated bots, friends & analysis

100% static. No server, no build step. Deployable to **GitHub Pages** in two minutes.

Features:
- 🤖 6 rated bots (300 → 1850), all running locally: **Sprout, Pixel, Mira, Jonah, Zara, Odin**.
- 👥 Local two-player and 🌐 online friend play through PeerJS (free WebRTC, no account: host creates a six-letter code, friend joins).
- 🔍 chess.com-style **Game Review**: eval bar, best-move arrow, principal variation, move classifications (Brilliant / Great / Best / Excellent / Good / Inaccuracy / Mistake / Miss / Blunder), tallies per side, per-move accuracy and white/black averages. Keyboard navigation, PGN/FEN import, hint engine.

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

| Bot | Elo | Search depth | Noise | Random blunders |
|-----|-----|--------------|-------|-----------------|
| Sprout | 300 | 1 ply | ±250cp | 26% |
| Pixel | 600 | 1 ply | ±110cp | 15% |
| Mira | 900 | 2 ply | ±70cp | 9% |
| Jonah | 1200 | 3 ply + quiescence | ±28cp | 4% |
| Zara | 1500 | 4 ply + quiescence | ±12cp | 2% |
| Odin | 1850 | 5 ply + quiescence | ±5cp | 1% |

Bots use the same engine as the analyser, with a time budget and an elo-appropriate amount of noise.

## Engine

- **Evaluation:** material, piece-square tables, tapered king safety with a pawn shield, bishop pair, rooks on open/semi-open files, doubled/isolated/passed pawns, tempo.
- **Search:** negamax alpha-beta with a transposition table, MVV-LVA ordering, killer moves, history heuristic, capture-only quiescence search with delta pruning, and iterative deepening (depth 4 for review, 5 for the top bot) under a time budget.
- **Accuracy:** centipawn eval → win probability (`100 / (1 + e^(-0.0038·cp))`), win-probability loss per move, then `103.1668·e^(-0.04354·Δ) − 3.1669` clamped to 0–100.
- Classification is based on win-probability drop, with Brilliant reserved for sound sacrifices that are also the best move and Great for a forced only-move.

## Online play

GitHub Pages cannot run a game server, so friend games use PeerJS cloud signalling for a peer-to-peer WebRTC link. Moves sync directly between the two browsers. Bot play and analysis need no network after the page and its two CDN scripts have loaded.

## Tech

- chess.js 0.10.3 (CDN) for rules
- PeerJS 1.5.4 (CDN) for online play
- Vanilla JS and CSS for the board, engine and analysis

No tracking, no backend, no API keys.

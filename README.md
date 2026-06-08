# Flashlearn

A local-first study web app for decks exported by JSON Deck Builder.

## Run

From this directory:

```bash
python3 -m http.server 4173
```

Then open `http://localhost:4173`.

## Features

- Four bundled Hands-on AI decks
- JSON deck import by file picker or drag and drop
- Single choice, multiple choice, true/false, and text questions
- Code snippets, images, explanations, tags, difficulty, and source metadata
- Local study history and spaced-review scheduling
- Full and ten-card sessions
- Session summaries and missed-card review
- Progress dashboard, progress export, deck export, and per-deck reset
- Keyboard controls and responsive dark mode
- Installable/offline PWA

All progress is stored in browser `localStorage`; no account or server is required.

# Nightforge Zen relay

Your game lives in a browser. Browsers refuse to call OpenCode Go directly
(Zen sends no CORS blessing), but servers may call anyone. This tiny Python
middleman — standard library only, no installs — takes calls from your game
and walks them over to Zen itself.

It holds **no api keys**. Your key travels browser → relay → Zen and is never
written anywhere. A stranger who finds your relay address can only spend
their *own* key through it.

## Run it on your own computer (testing)

```bash
python relay/server.py
```

It listens on port `8099` (or whatever `PORT` is set to). Check it:

```bash
curl http://127.0.0.1:8099/
```

## Host it for the live site (five minutes, Render)

1. Push this repository to GitHub (private is fine).
2. In Render: **New → Web Service → your repo**.
3. Build command: `echo ok` (there is nothing to install).
4. Start command: `python relay/server.py`.
5. Use the free plan. Render hands you an address like
   `https://roll30-relay.onrender.com`.
6. In the game: open the sage, hit the gear, choose
   **OpenCode Go (relay)**, paste that address, paste your key, talk.

Free plans sleep when idle — the first message after a nap takes ~30 seconds
while the relay wakes up. Later messages are instant.

## Point the bubble at it

Sage → gear → **OpenCode Go (relay)** → Relay address → your address →
API key → your `sk-` key. The address and key stay in that browser only.

## What it forwards

- `POST /chat/completions` → Zen, verbatim body, your `Authorization` header.
- `GET /models` → Zen, handy for checking which model names exist.
- `GET /` → a tiny health reply so you know it is awake.
- Everything else → `404`. Bodies over 4 MiB → `413`.

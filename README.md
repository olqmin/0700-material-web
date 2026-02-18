# Material Dialer-style Static UI

A static Material Web starter inspired by Google Dialer. It runs on shared hosting with only:

- `index.html`
- `styles.css`
- `main.js`

## Features

- Material Web components and tokens
- Dialer-style dark UI with contact history cards
- Search field with client-side filtering
- Bottom navigation state toggle (Home / Keypad)

## Run locally

```bash
python3 -m http.server 8080
```

Then open <http://localhost:8080>.

## Deploy

Upload these files to your hosting public directory (e.g. `public_html/`).

## Open directly from file system

You can open `index.html` directly (double-click). `main.js` is loaded as a deferred classic script for `file://` compatibility.

> Note: Material Web and fonts are loaded from CDNs. Ensure client browsers can access those domains.

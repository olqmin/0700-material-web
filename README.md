# Material Dialer-style Static UI

A static Material Web dialer-style interface for shared hosting.

## Files

- `index.html`
- `styles.css`
- `main.js`

## What's included

- Pure black theme
- Wider app layout for desktop preview
- Material search field with working icon fonts
- Call history list cards with call action icons
- Client-side search filtering in plain JavaScript

## Run locally

```bash
python3 -m http.server 8080
```

Then open <http://localhost:8080>.

## Deploy

Upload all files to your hosting public directory (for example `public_html/`).

## Open directly from file system

You can open `index.html` directly (double-click). `main.js` is a deferred classic script for `file://` compatibility.

> Note: Material Web and Google Fonts are loaded from CDNs, so client browsers need internet access to those domains.

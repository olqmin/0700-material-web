# Material Web Static Starter

A minimal **Material Web** starter that works on shared hosting using only:

- `index.html`
- `styles.css`
- `main.js`

## Run locally

```bash
python3 -m http.server 8080
```

Then open <http://localhost:8080>.

## Deploy

Upload these files to your hosting public directory (for example `public_html/`).

> Note: Material Web modules are loaded from a CDN (`esm.run`). Make sure your hosting allows client access to external CDNs.

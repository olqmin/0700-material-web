# Material Dialer-style Static UI

A static Material Web dialer-style interface for shared hosting.

## Files

- `index.html`
- `styles.css`
- `main.js`

## What's included

- Pure black theme
- Wider app layout for desktop preview
- Material search field without underline
- Contacts rendered dynamically from API JSON
- Displays contact logo, name, phone number, and paid phone (if present)
- Client-side search filtering in plain JavaScript

## API source

The app fetches contacts from:

`https://admin.0700bezplatnite.com/0700backend/contact/getIOSContacts`

The renderer is tolerant to common key variations (`name`, `phone`, `paidPhone`, `logo`, etc.).

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

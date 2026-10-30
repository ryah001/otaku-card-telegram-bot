# Official React card renderer (isolated harness)

This harness mounts the website's real `src/OtakuCard.jsx` component; it does not redraw the card in Python or HTML. It is intended for CI validation and later bot integration. It does not authenticate users, save history, write to Supabase, or use service-role credentials.

## Run inside a checkout of `ryah001/otaku-card-maker`

Copy `renderer.html`, `renderer.jsx`, `renderer.css`, and `screenshot.mjs` into the website checkout root (renaming `renderer.html` to be served as-is), install the website dependencies and Playwright, install the matching Playwright Chromium browser, then run Vite preview on port 4173 and execute `node screenshot.mjs`.

The card profile fields are demo values only. The harness defaults to a built-in template so it does not require Supabase configuration or read the live catalog. For production, the bot must pass validated profile data and a currently active template, and the renderer must remain internal to the bot service.

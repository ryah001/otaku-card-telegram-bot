# Otaku Card Telegram Bot

Telegram companion bot for the [Otaku Card Maker website](https://ryah001.github.io/otaku-card-maker/).

## Cloudflare Worker deployment (webhook edition)

This repo contains the original Python polling bot and an isolated Cloudflare Worker adapter. Do not deploy the Python Dockerfile to Workers. The Worker receives Telegram updates by webhook and stores short-lived conversation state in Cloudflare KV.

### Cloudflare setup

1. In Cloudflare, create a KV namespace named `OTakuSessions`.
2. Copy its namespace ID and replace `REPLACE_WITH_KV_NAMESPACE_ID` in `wrangler.toml` with that exact ID.
3. In Worker settings, configure these secrets:
   - `TELEGRAM_BOT_TOKEN`: token from BotFather
   - `TELEGRAM_WEBHOOK_SECRET`: generate a random 32+ character string using only letters, digits, underscores, and hyphens
   - `SETUP_SECRET`: a separate random secret used only to authorize webhook registration
4. Configure these variables (not secrets):
   - `SUPABASE_URL`: HTTPS URL of the Supabase project
   - `SUPABASE_ANON_KEY`: public anon/publishable key only; never service_role
5. Configure Cloudflare Workers Builds to use `wrangler.toml` at the repository root and deploy the branch `feature/cloudflare-webhook-adapter`.
6. After the Worker is deployed, register the webhook by sending a POST request to `https://<your-worker-domain>/setup/webhook` with header `x-setup-secret: <your SETUP_SECRET>`. The Worker calls Telegram's `setWebhook` API and configures Telegram to send updates to `/telegram/webhook`.
7. Verify `https://<your-worker-domain>/health` returns `{"ok":true,"service":"otaku-card-telegram-bot"}`, then send `/start` to the Telegram bot.

Never place a real token in source code, GitHub commits, chat, or a public URL. Do not enable both the old polling bot and webhook bot at the same time; Telegram does not support polling while a webhook is active.

### Current scope and limitations

The Worker supports /start, /help, /cancel, active-template listing from Supabase, guided profile intake, color selection, and profile review. It deliberately does **not** claim to render a PNG or write website history. Official React card rendering, secure website-account linking, quota enforcement, and history integration remain separate work and require backend design/testing.

The original Python implementation remains intact. Do not merge this branch to `main` until the Worker is deployed and tested.

# Otaku Card Telegram Bot

Telegram companion bot for the [Otaku Card Maker website](https://ryah001.github.io/otaku-card-maker/).

## Status

The bot has a working menu and a guided profile intake flow (name, username, role, short bio, optional WhatsApp number, and color selection). It validates basic input and displays a review summary. It does **not** yet render or send a PNG, fetch live Supabase templates, authenticate/link a website account, assign HUNTER IDs, or write to card history. Those capabilities must be connected to the website's secure backend before being advertised as active.

## Run locally

1. Install Python 3.11 or newer.
2. Install dependencies: `pip install -r requirements.txt`.
3. Copy `.env.example` to `.env` and set `TELEGRAM_BOT_TOKEN` locally.
4. Run `python -m bot`.

Never commit `.env`, Telegram bot tokens, Supabase service-role keys, or OAuth credentials. Configure secrets in your hosting provider's environment settings.

## Deployment

The repository includes a Dockerfile, a Render worker blueprint, and a GitHub Actions validation workflow. Set `TELEGRAM_BOT_TOKEN` as a Render secret/environment variable before deploying.

## Planned integration requirements

- Fetch active templates and published layout versions from Supabase.
- Link Telegram users to website accounts using a short-lived, one-time website-generated code; never request Google passwords in Telegram.
- Reuse the website's actual React card component in a controlled browser renderer for pixel-identical PNGs.
- Enforce creation limits in a secure backend and keep temporary bot renders separate from `card_history` and the site's storage bucket.
- Add tests for input validation, authorization, quotas, and rendering before enabling card generation.

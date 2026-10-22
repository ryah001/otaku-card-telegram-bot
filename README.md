# Otaku Card Telegram Bot

Telegram companion bot for the [Otaku Card Maker website](https://ryah001.github.io/otaku-card-maker/).

## Current status

- Working `/start`, `/help`, and guided profile intake.
- Read-only Supabase catalog module added for active `card_templates`, using the public anon key.
- Docker, Render worker blueprint, and GitHub Actions compile checks.

**Not implemented yet:** the bot UI integration for template selection, PNG rendering, secure account linking, HUNTER ID assignment, quota enforcement, and site history writes. The bot must not claim to generate or save a card until those pieces are implemented.

## Local setup

1. Install Python 3.11 or newer.
2. Install dependencies: `pip install -r requirements.txt`.
3. Copy `.env.example` to `.env` and set `TELEGRAM_BOT_TOKEN`.
4. Set `SUPABASE_URL` and `SUPABASE_ANON_KEY` to enable catalog integration.
5. Run `python -m bot`.

Never commit `.env`, Telegram bot tokens, Supabase service-role keys, or OAuth credentials. Configure values in your hosting provider's environment settings. Use only the public anon/publishable key; RLS must restrict database reads.

## Deployment

Set `TELEGRAM_BOT_TOKEN`, `SUPABASE_URL`, and `SUPABASE_ANON_KEY` in Render's environment settings. Do not put real values in `render.yaml`.

## Required next integration

- Connect the active template catalog to the Telegram selection flow.
- Link Telegram users to website accounts using a short-lived, one-time website-generated code; never request Google passwords in Telegram.
- Reuse the website's actual React card component in a controlled browser renderer for pixel-identical PNGs.
- Enforce creation limits in a secure backend and keep temporary bot renders separate from `card_history` and the site's storage bucket.

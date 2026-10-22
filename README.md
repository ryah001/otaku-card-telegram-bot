# Otaku Card Telegram Bot

Telegram bot for the Otaku Card Maker project.

## Status

Initial project scaffold. The Telegram conversation flow and rendering backend are being implemented incrementally.

## Requirements
- Python 3.11+
- Telegram bot token configured as `TELEGRAM_BOT_TOKEN`

## Local setup

1. Create a virtual environment.
2. Install dependencies: `pip install -r requirements.txt`
3. Copy `.env.example` to `.env` and set `TELEGRAM_BOT_TOKEN`.
4. Run `python -m bot`.

Never commit `.env` or bot tokens.

## Current scope
- `/start` and `/help`
- Interactive menu scaffold
- Configuration validation

Supabase account linking, shared quotas, and pixel-identical card rendering are not enabled until their secure backend contract is implemented.
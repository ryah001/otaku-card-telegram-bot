"""Environment-based application configuration."""

from dataclasses import dataclass
import logging
import os

from dotenv import load_dotenv


@dataclass(frozen=True)
class Settings:
    telegram_bot_token: str
    log_level: str = "INFO"
    bot_admin_user_id: int | None = None


def load_settings() -> Settings:
    load_dotenv()
    token = os.getenv("TELEGRAM_BOT_TOKEN", "").strip()
    if not token:
        raise RuntimeError(
            "TELEGRAM_BOT_TOKEN is missing. Set it in your environment or local .env file."
        )

    admin_raw = os.getenv("BOT_ADMIN_USER_ID", "").strip()
    admin_id = int(admin_raw) if admin_raw else None
    log_level = os.getenv("LOG_LEVEL", "INFO").upper()
    if log_level not in {"DEBUG", "INFO", "WARNING", "ERROR", "CRITICAL"}:
        log_level = "INFO"
    return Settings(token, log_level, admin_id)


def configure_logging(level: str) -> None:
    logging.basicConfig(
        level=getattr(logging, level, logging.INFO),
        format="%(asctime)s | %(levelname)s | %(name)s | %(message)s",
    )

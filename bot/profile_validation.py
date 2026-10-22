"""Small, deterministic validators for user-supplied card profile fields."""
from __future__ import annotations
import re


def normalize_whatsapp(value: str) -> str | None:
    """Return digits-only international number, or None if its length is implausible."""
    digits = re.sub(r"\D", "", value)
    if not 8 <= len(digits) <= 15:
        return None
    return digits


def clean_optional_text(value: str, *, max_length: int) -> str:
    """Trim user text and remove control characters, while enforcing a hard length cap."""
    cleaned = "".join(ch for ch in value.strip() if ch.isprintable())
    return cleaned[:max_length]

"Read-only access to the public active card-template catalog."
from __future__ import annotations
import os
from typing import Any
import httpx

class CatalogUnavailable(RuntimeError):
    """The public template catalog is not configured or reachable."""

def _settings() -> tuple[str, str]:
    url = os.getenv("SUPABASE_URL", "").strip().rstrip("/")
    key = os.getenv("SUPABASE_ANON_KEY", "").strip()
    if not url or not key:
        raise CatalogUnavailable("Supabase catalog is not configured")
    if not url.startswith("https://"):
        raise CatalogUnavailable("SUPABASE_URL must use HTTPS")
    return url, key

async def fetch_active_templates() -> list[dict[str, str]]:
    """Fetch active template labels/keys using the anon key, never service_role."""
    url, key = _settings()
    headers = {"apikey": key, "Authorization": f"Bearer {key}"}
    params = {"select": "id,template_key,label,asset_path", "is_active": "eq.true", "order": "label.asc"}
    try:
        async with httpx.AsyncClient(timeout=8.0, follow_redirects=False) as client:
            response = await client.get(f"{url}/rest/v1/card_templates", params=params, headers=headers)
            response.raise_for_status()
            payload: Any = response.json()
    except (httpx.HTTPError, ValueError) as exc:
        raise CatalogUnavailable("Could not fetch active templates") from exc
    if not isinstance(payload, list):
        raise CatalogUnavailable("Unexpected template catalog response")
    templates = []
    for row in payload:
        if isinstance(row, dict):
            key_value = str(row.get("template_key") or "").strip()
            label = str(row.get("label") or key_value).strip()
            if key_value and label:
                templates.append({"template_key": key_value[:48], "label": label[:60]})
    return templates[:40]

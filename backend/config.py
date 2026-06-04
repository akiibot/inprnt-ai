"""
Imprnt AI — Application Settings
All configuration is loaded from environment variables / .env file.
"""
from pathlib import Path
from pydantic_settings import BaseSettings, SettingsConfigDict

# .env lives one level above this file (project root), regardless of cwd
_ENV_FILE = Path(__file__).parent.parent / ".env"


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=str(_ENV_FILE),
        env_file_encoding="utf-8",
        extra="ignore",
    )

    # Google AI Studio (Gemini) — use ONE of these two:
    GOOGLE_AI_API_KEY: str = ""             # API key from aistudio.google.com (starts with AIza)
    GOOGLE_SERVICE_ACCOUNT_PATH: str = ""   # Path to a service account JSON key file

    # Cloudflare Workers AI (Flux image generation)
    CLOUDFLARE_API_TOKEN: str = ""
    CLOUDFLARE_ACCOUNT_ID: str = ""

    # Remove.bg
    REMOVEBG_API_KEY: str = ""

    # Supabase
    SUPABASE_URL: str = ""
    SUPABASE_SERVICE_KEY: str = ""

    # App
    APP_ENV: str = "development"
    DEMO_FALLBACK_MODE: bool = False

    @property
    def cloudflare_flux_url(self) -> str:
        """Full Cloudflare Workers AI endpoint URL for Flux 1 Schnell."""
        return (
            f"https://api.cloudflare.com/client/v4/accounts/"
            f"{self.CLOUDFLARE_ACCOUNT_ID}/ai/run/"
            f"@cf/black-forest-labs/flux-1-schnell"
        )


settings = Settings()

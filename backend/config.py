"""
Imprnt AI — Application Settings
All configuration is loaded from environment variables / .env file.
"""
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    # Google AI Studio (Gemini)
    GOOGLE_AI_API_KEY: str = ""

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

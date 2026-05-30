"""
Imprnt AI — FastAPI Backend
Main application entry point with CORS and all router registrations.
"""
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv

load_dotenv()

from config import settings
from routers import brands, campaigns, export

app = FastAPI(
    title="Imprnt AI API",
    description="AI-powered brand intelligence and creative direction platform",
    version="0.1.0",
    docs_url="/docs",
    redoc_url="/redoc",
)

# ── CORS ─────────────────────────────────────────────────────────────────────
# Origins are read from ALLOWED_ORIGINS env var (comma-separated).
# Default covers local development; set to your Vercel URL in production.
_origins = [o.strip() for o in settings.ALLOWED_ORIGINS.split(",") if o.strip()]

app.add_middleware(
    CORSMiddleware,
    allow_origins=_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── Routers ──────────────────────────────────────────────────────────────────
app.include_router(brands.router, prefix="/api")
app.include_router(campaigns.router, prefix="/api")
app.include_router(export.router, prefix="/api")


# ── Health Check ─────────────────────────────────────────────────────────────
@app.get("/api/health", tags=["Health"])
async def health_check():
    """Returns API health status. Used by frontend to verify backend is running."""
    return {
        "status": "ok",
        "version": "0.1.0",
        "environment": settings.APP_ENV,
    }

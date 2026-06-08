"""
Imprnt AI — FastAPI Backend
Main application entry point with CORS and all router registrations.
"""
import os
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv

load_dotenv()

from config import settings
from routers import brands, campaigns, export
from compositor.renderer import startup_browser, shutdown_browser


@asynccontextmanager
async def lifespan(app: FastAPI):
    await startup_browser()
    yield
    await shutdown_browser()


app = FastAPI(
    lifespan=lifespan,
    title="Imprnt AI API",
    description="AI-powered brand intelligence and creative direction platform",
    version="0.1.0",
    docs_url="/docs",
    redoc_url="/redoc",
)

# ── CORS ─────────────────────────────────────────────────────────────────────
# allow_origin_regex covers all Vercel preview + production deployments automatically.
_ORIGIN_REGEX = (
    r"https?://localhost(:\d+)?"
    r"|https://[\w-]+-akiiibots-projects\.vercel\.app"
    r"|https://inprnt-ai[\w-]*\.vercel\.app"
)
# FRONTEND_URL can still override / extend with a custom domain e.g. https://imprnt.ai
_extra = [o.strip() for o in os.getenv("FRONTEND_URL", "").split(",") if o.strip()]

app.add_middleware(
    CORSMiddleware,
    allow_origins=_extra or ["*"],
    allow_origin_regex=_ORIGIN_REGEX,
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

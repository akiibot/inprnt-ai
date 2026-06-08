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
_DEV_ORIGINS = [
    "http://localhost:3000",
    "http://127.0.0.1:3000",
    "http://localhost:3001",
    "http://127.0.0.1:3001",
    "http://localhost:3002",
    "http://127.0.0.1:3002",
    "http://localhost:3005",
    "http://127.0.0.1:3005",
]
# Set FRONTEND_URL in Railway to your Vercel deployment URL, e.g. https://imprnt.vercel.app
_extra = [o.strip() for o in os.getenv("FRONTEND_URL", "").split(",") if o.strip()]
_ALLOWED_ORIGINS = _DEV_ORIGINS + _extra

app.add_middleware(
    CORSMiddleware,
    allow_origins=_ALLOWED_ORIGINS,
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

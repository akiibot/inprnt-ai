# Imprnt AI — Backend Dockerfile
# Python 3.11 slim + Chromium system deps for Playwright

FROM python:3.11-slim

# ── System deps required by Playwright/Chromium ────────────────────────────
RUN apt-get update && apt-get install -y --no-install-recommends \
    libglib2.0-0 \
    libnss3 \
    libnspr4 \
    libatk1.0-0 \
    libatk-bridge2.0-0 \
    libcups2 \
    libdrm2 \
    libdbus-1-3 \
    libxcb1 \
    libxkbcommon0 \
    libx11-6 \
    libx11-xcb1 \
    libxcomposite1 \
    libxdamage1 \
    libxext6 \
    libxfixes3 \
    libxrandr2 \
    libgbm1 \
    libpango-1.0-0 \
    libpangocairo-1.0-0 \
    libcairo2 \
    libasound2 \
    libatspi2.0-0 \
    libwayland-client0 \
    fonts-liberation \
    wget \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# ── Python dependencies ───────────────────────────────────────────────────
# Build context is the repo root (Railway default), so paths are prefixed
# with backend/. For local `docker build .` runs, this also works as long
# as you build from the repo root.
COPY backend/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# ── Playwright Chromium browser ───────────────────────────────────────────
RUN playwright install chromium

# ── Application code ──────────────────────────────────────────────────────
COPY backend/ .

# ── Run ───────────────────────────────────────────────────────────────────
# PORT is injected by Railway; default to 8000 for local docker run
ENV PORT=8000
EXPOSE 8000

CMD ["sh", "-c", "uvicorn main:app --host 0.0.0.0 --port ${PORT}"]

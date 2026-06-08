# Build context: inprnt-ai/ (project root)
# Playwright Python image ships Chromium — no separate install needed.
FROM mcr.microsoft.com/playwright/python:v1.60.0-noble

WORKDIR /app

# Install deps first so this layer is cached unless requirements.txt changes
COPY backend/requirements.txt ./backend/requirements.txt
RUN pip install --no-cache-dir -r backend/requirements.txt

# Copy source — mock-data lives inside backend/ for single-context builds
COPY backend/ ./backend/

WORKDIR /app/backend

ENV APP_ENV=production

# Railway injects $PORT at runtime
CMD ["sh", "-c", "uvicorn main:app --host 0.0.0.0 --port ${PORT:-8000}"]

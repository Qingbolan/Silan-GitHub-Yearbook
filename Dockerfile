# Stage 1: Build Frontend
FROM node:20-slim AS frontend-builder

WORKDIR /app/web

# Copy frontend package files
COPY web/package*.json ./

# Install dependencies
RUN npm ci

# Copy frontend source
COPY web/ ./

# Build frontend
# This will output to /app/web/dist
RUN npm run build

# Stage 2: Backend Runtime
FROM python:3.12-slim

WORKDIR /app

# Install system dependencies for Playwright and general utility
# Playwright needs specific libraries. 'playwright install-deps' usually handles this, 
# but installing them in the dockerfile is cleaner for caching.
# We'll rely on `playwright install --with-deps` but need some basics first.
RUN apt-get update && apt-get install -y \
    curl \
    git \
    && rm -rf /var/lib/apt/lists/*

# Install uv for fast python dependency management
COPY --from=ghcr.io/astral-sh/uv:latest /uv /bin/uv

# Copy backend dependency definition
COPY backend/pyproject.toml backend/uv.lock /app/backend/

# Install python dependencies
WORKDIR /app/backend
RUN uv sync --frozen --no-dev

# Install Playwright browsers (Chromium only to save space/time)
# We need to activate the virtual environment created by uv or run using `uv run`
# uv creates venv in .venv by default.
ENV PATH="/app/backend/.venv/bin:$PATH"
RUN playwright install --with-deps chromium

# Copy backend source code
COPY backend /app/backend

# Copy built frontend assets from builder stage
# We place them in /app/web/dist so the backend logic `repo_root / "web" / "dist"` works
# repo_root will be /app
COPY --from=frontend-builder /app/web/dist /app/web/dist

# Set environment variables
ENV PYTHONUNBUFFERED=1
ENV PYTHONDONTWRITEBYTECODE=1
# Ensure we are running from the correct directory for relative imports if needed, 
# though uvicorn app.main:app usually handles it if PYTHONPATH is set or cwd is right.
# Our main.py is in /app/backend/app/main.py.
# If we run from /app/backend, `app.main` works.
WORKDIR /app/backend

# Expose port
EXPOSE 8000

# Command to run the application
# We use the venv python directly
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]

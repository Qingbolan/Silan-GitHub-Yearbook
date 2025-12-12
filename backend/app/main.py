from contextlib import asynccontextmanager
from pathlib import Path
import logging

from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from fastapi.middleware.cors import CORSMiddleware

from .core.database import init_db
from .api.routes import router

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup: initialize database
    await init_db()

    # Log frontend dist status
    repo_root = Path(__file__).resolve().parents[2]
    frontend_dist = repo_root / "web" / "dist"
    logger.info(f"Looking for frontend at: {frontend_dist}")
    logger.info(f"Frontend dist exists: {frontend_dist.exists()}")
    if frontend_dist.exists():
        logger.info(f"Frontend dist contents: {list(frontend_dist.iterdir())}")

    yield
    # Shutdown: cleanup if needed


app = FastAPI(
    title="GitHub Yearbook API",
    description="Backend service for GitHub Yearbook stats",
    version="0.1.0",
    lifespan=lifespan,
)

# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Configure for production
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include routes
app.include_router(router, prefix="/api")


# Diagnostic endpoint to check frontend status
@app.get("/api/debug/frontend-status")
async def frontend_status():
    """Diagnostic endpoint to check frontend file status."""
    repo_root = Path(__file__).resolve().parents[2]
    frontend_dist = repo_root / "web" / "dist"

    result = {
        "main_py_location": str(Path(__file__).resolve()),
        "repo_root": str(repo_root),
        "frontend_dist_path": str(frontend_dist),
        "frontend_dist_exists": frontend_dist.exists(),
        "repo_root_contents": [str(p.name) for p in repo_root.iterdir()] if repo_root.exists() else [],
    }

    if frontend_dist.exists():
        result["frontend_dist_contents"] = [str(p.name) for p in frontend_dist.iterdir()]
        index_html = frontend_dist / "index.html"
        result["index_html_exists"] = index_html.exists()

    return result


# Serve frontend static files
# Navigate 3 levels up from app/main.py to get to repo root
repo_root = Path(__file__).resolve().parents[2]
frontend_dist = repo_root / "web" / "dist"

logger.info(f"[Startup] Checking frontend at: {frontend_dist}")
logger.info(f"[Startup] Frontend exists: {frontend_dist.exists()}")

if frontend_dist.exists():
    assets_dir = frontend_dist / "assets"
    if assets_dir.exists():
        app.mount("/assets", StaticFiles(directory=assets_dir), name="assets")
        logger.info(f"[Startup] Mounted /assets from {assets_dir}")
    else:
        logger.warning(f"[Startup] Assets directory not found: {assets_dir}")

    @app.get("/{rest_of_path:path}")
    async def serve_frontend(rest_of_path: str):
        """Serve SPA frontend for any non-API routes."""
        # Check if file exists (e.g. favicon.ico)
        file_path = frontend_dist / rest_of_path
        if file_path.is_file():
            return FileResponse(file_path)

        # Fallback to index.html for SPA routing
        return FileResponse(frontend_dist / "index.html")
else:
    logger.error(f"[Startup] Frontend dist NOT FOUND at {frontend_dist}")
    logger.error(f"[Startup] Parent directory contents: {list(repo_root.iterdir()) if repo_root.exists() else 'repo_root not found'}")

    @app.get("/{rest_of_path:path}")
    async def frontend_not_available(rest_of_path: str):
        """Return error when frontend is not available."""
        from fastapi.responses import JSONResponse
        return JSONResponse(
            status_code=503,
            content={
                "error": "Frontend not available",
                "detail": f"Frontend dist not found at {frontend_dist}",
                "hint": "The Docker image may not have been built correctly. Check that 'npm run build' succeeded."
            }
        )

"""
Imprnt AI — Video Generator Service
Writes a HyperFrames composition HTML → runs HyperFrames CLI → uploads MP4.
"""
from __future__ import annotations

import asyncio
import json
import shutil
import subprocess
import tempfile
import time
import uuid
from datetime import datetime, timezone
from pathlib import Path

from compositor.video_template import build_video_html
from services.supabase_client import upload_file_to_storage


# HyperFrames project config — mirrors what `npx hyperframes init` scaffolds.
_HYPERFRAMES_JSON = {
    "$schema": "https://hyperframes.heygen.com/schema/hyperframes.json",
    "registry": "https://raw.githubusercontent.com/heygen-com/hyperframes/main/registry",
    "paths": {
        "blocks": "compositions",
        "components": "compositions/components",
        "assets": "assets",
    },
}


def _scaffold_project(project_dir: Path, html: str) -> None:
    """
    Write the minimal HyperFrames project structure the render CLI expects:
    hyperframes.json + meta.json + index.html (the composition entry point).
    """
    project_id = project_dir.name
    (project_dir / "hyperframes.json").write_text(
        json.dumps(_HYPERFRAMES_JSON, indent=2), encoding="utf-8"
    )
    (project_dir / "meta.json").write_text(
        json.dumps({
            "id": project_id,
            "name": project_id,
            "createdAt": datetime.now(timezone.utc).isoformat(),
        }, indent=2),
        encoding="utf-8",
    )
    # index.html is the default composition entry HyperFrames renders.
    (project_dir / "index.html").write_text(html, encoding="utf-8")


def _run_hyperframes(project_dir: Path, output_path: Path, fps: int = 30) -> None:
    """
    Run the HyperFrames CLI to render the project's index.html → output MP4.
    Raises on non-zero exit or missing output file.
    """
    result = subprocess.run(
        [
            "npx", "--yes", "hyperframes", "render",
            str(project_dir),
            "--output", str(output_path),
            "--fps", str(fps),
            "--quiet",
        ],
        capture_output=True,
        text=True,
        timeout=300,  # 5-minute hard cap
        cwd=str(project_dir),
    )

    if result.returncode != 0:
        stderr = (result.stderr or "").strip()
        stdout = (result.stdout or "").strip()
        raise Exception(
            f"HyperFrames render failed (exit {result.returncode}).\n"
            f"stderr: {stderr[:600]}\nstdout: {stdout[:300]}"
        )

    if not output_path.exists():
        raise Exception("HyperFrames exited 0 but produced no MP4 output.")


def render_video_sync(
    blueprint: dict,
    brand: dict,
    assets: dict,
    video_plan: dict,
) -> str:
    """
    Scaffold a HyperFrames project → build composition HTML → run render →
    return local MP4 path. Caller cleans up the temp directory.
    """
    project_dir = Path(tempfile.mkdtemp(prefix=f"hf_{uuid.uuid4().hex[:8]}_"))
    output_path = project_dir / "output.mp4"

    html = build_video_html(blueprint, brand, assets, video_plan)
    _scaffold_project(project_dir, html)

    fps = int(video_plan.get("fps", 30))
    _run_hyperframes(project_dir, output_path, fps)

    return str(output_path)


async def render_and_upload_video(
    campaign_id: str,
    blueprint: dict,
    brand: dict,
    assets: dict,
    video_plan: dict,
) -> tuple[str, float]:
    """
    Blocking render in an executor (keeps FastAPI event loop free) → upload MP4.
    Returns (supabase_video_url, elapsed_seconds).
    """
    start = time.time()
    loop = asyncio.get_running_loop()

    mp4_path_str = await loop.run_in_executor(
        None,
        lambda: render_video_sync(blueprint, brand, assets, video_plan),
    )

    mp4_path = Path(mp4_path_str)
    project_dir = mp4_path.parent

    try:
        ar_label = (
            blueprint.get("format", {}).get("aspect_ratio", "1:1").replace(":", "x")
        )
        storage_key = f"{campaign_id}/video_{ar_label}.mp4"

        video_bytes = mp4_path.read_bytes()
        video_url = await loop.run_in_executor(
            None,
            lambda: upload_file_to_storage(
                "campaigns", storage_key, video_bytes, "video/mp4"
            ),
        )

        return video_url, time.time() - start
    finally:
        shutil.rmtree(project_dir, ignore_errors=True)

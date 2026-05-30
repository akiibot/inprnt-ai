"""
Imprnt AI — Compositor: Playwright Renderer
Phase 1 — Core implementation.

Using Playwright (async) instead of pyppeteer due to websockets version conflict.
Playwright has superior Apple Silicon (M-series) support.

render_poster(html, width, height, output_path) → str (absolute path to PNG)

Key detail: page.wait_for_load_state("networkidle") ensures Google Fonts
finish loading before screenshot is taken. Bengali text will not render
correctly if the screenshot fires before fonts are loaded.
"""

from __future__ import annotations

import asyncio
from pathlib import Path


async def _render_async(
    html: str,
    width: int,
    height: int,
    output_path: str,
) -> str:
    """Internal async implementation using Playwright."""
    from playwright.async_api import async_playwright

    async with async_playwright() as pw:
        browser = await pw.chromium.launch(headless=True)
        context = await browser.new_context(
            viewport={"width": width, "height": height},
            device_scale_factor=1,
        )
        page = await context.new_page()

        # Set HTML content and wait for network to be idle
        # (ensures Google Fonts @import has fully loaded)
        await page.set_content(html, wait_until="networkidle")

        # Extra safety: explicitly wait for the two Bengali font families
        # to be available in the browser before screenshotting.
        try:
            await page.evaluate("""async () => {
                await Promise.all([
                    document.fonts.load("700 72px 'Hind Siliguri'"),
                    document.fonts.load("400 72px 'Noto Sans Bengali'"),
                    document.fonts.load("400 72px 'Anton'"),
                    document.fonts.load("400 16px 'Inter'"),
                ]);
            }""")
        except Exception:
            # Font API unavailable — networkidle is sufficient fallback
            pass

        # Screenshot exactly the viewport (no full-page scroll)
        out = Path(output_path)
        out.parent.mkdir(parents=True, exist_ok=True)
        await page.screenshot(
            path=str(out),
            clip={"x": 0, "y": 0, "width": width, "height": height},
            type="png",
        )
        await browser.close()

    return str(out.resolve())


def render_poster(
    html: str,
    width: int,
    height: int,
    output_path: str,
) -> str:
    """
    Synchronous wrapper around the async Playwright renderer.
    Safe to call from both sync and async contexts.

    Args:
        html:        Complete self-contained HTML string from build_html()
        width:       Canvas width in pixels
        height:      Canvas height in pixels
        output_path: Absolute or relative path for the output PNG

    Returns:
        Absolute path to the rendered PNG file.
    """
    try:
        loop = asyncio.get_event_loop()
        if loop.is_running():
            # We're inside an async context (e.g. FastAPI route) —
            # use asyncio.ensure_future and run in executor
            import concurrent.futures
            with concurrent.futures.ThreadPoolExecutor() as pool:
                future = pool.submit(
                    asyncio.run,
                    _render_async(html, width, height, output_path),
                )
                return future.result()
        else:
            return loop.run_until_complete(
                _render_async(html, width, height, output_path)
            )
    except RuntimeError:
        return asyncio.run(_render_async(html, width, height, output_path))

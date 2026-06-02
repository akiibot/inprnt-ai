"""
Imprnt AI — Compositor: Playwright Renderer

A single Chromium browser is kept alive for the lifetime of the FastAPI process.
Call startup_browser() on server startup and shutdown_browser() on shutdown.
Each render gets its own browser context (lightweight) — avoids 1-2s cold-start
per request while still isolating renders from each other.
"""

from __future__ import annotations

import asyncio
from pathlib import Path
from typing import TYPE_CHECKING, Optional

if TYPE_CHECKING:
    from playwright.async_api import Browser, Playwright

_playwright_ctx: Optional["Playwright"] = None
_browser: Optional["Browser"] = None


async def startup_browser() -> None:
    """Launch the shared Chromium browser. Call once at FastAPI startup."""
    global _playwright_ctx, _browser
    try:
        from playwright.async_api import async_playwright
        _playwright_ctx = await async_playwright().start()
        _browser = await _playwright_ctx.chromium.launch(headless=True)
        print("Playwright: persistent browser started.")
    except Exception as exc:
        print(f"Playwright: startup failed ({exc}) — per-request fallback active.")


async def shutdown_browser() -> None:
    """Close the shared browser. Call once at FastAPI shutdown."""
    global _playwright_ctx, _browser
    if _browser:
        await _browser.close()
        _browser = None
    if _playwright_ctx:
        await _playwright_ctx.stop()
        _playwright_ctx = None
    print("Playwright: browser closed.")


async def _do_render(context, html: str, width: int, height: int, output_path: str) -> str:
    """Render HTML to PNG inside an already-open browser context."""
    page = await context.new_page()
    try:
        # Fonts are embedded as base64 data URIs (no network), but the
        # background/logo/product images are remote Supabase URLs. Always wait
        # for the network so those remote images are present before screenshot.
        await page.set_content(html, wait_until="networkidle")

        # Belt-and-suspenders: explicitly wait for fonts AND every image
        # (both <img> tags and CSS background-image) to finish loading/decoding.
        try:
            await page.evaluate("""async () => {
                // 1. Fonts
                await Promise.all([
                    document.fonts.load("700 72px 'Hind Siliguri'"),
                    document.fonts.load("400 72px 'Noto Sans Bengali'"),
                    document.fonts.load("400 72px 'Anton'"),
                    document.fonts.load("400 16px 'Inter'"),
                ]);
                await document.fonts.ready;

                // 2. <img> tags — wait until each is fully decoded
                await Promise.all(
                    Array.from(document.images).map(img =>
                        img.complete && img.naturalWidth > 0
                            ? Promise.resolve()
                            : img.decode().catch(() => {})
                    )
                );

                // 3. CSS background-image URLs — preload each via an Image()
                const bgEls = Array.from(document.querySelectorAll('*')).filter(el => {
                    const bg = getComputedStyle(el).backgroundImage;
                    return bg && bg.startsWith('url(');
                });
                await Promise.all(bgEls.map(el => {
                    const m = getComputedStyle(el).backgroundImage.match(/url\\(["']?([^"')]+)["']?\\)/);
                    if (!m) return Promise.resolve();
                    return new Promise(resolve => {
                        const i = new Image();
                        i.onload = i.onerror = () => resolve();
                        i.src = m[1];
                    });
                }));
            }""")
        except Exception:
            pass

        out = Path(output_path)
        out.parent.mkdir(parents=True, exist_ok=True)
        await page.screenshot(
            path=str(out),
            clip={"x": 0, "y": 0, "width": width, "height": height},
            type="png",
        )
        return str(out.resolve())
    finally:
        await page.close()


async def render_poster_async(
    html: str,
    width: int,
    height: int,
    output_path: str,
) -> str:
    """
    Render HTML → PNG. Reuses the shared browser when available;
    falls back to a fresh per-request browser otherwise.
    """
    if _browser and _browser.is_connected():
        context = await _browser.new_context(
            viewport={"width": width, "height": height},
            device_scale_factor=1,
        )
        try:
            return await _do_render(context, html, width, height, output_path)
        finally:
            await context.close()
    else:
        # Fallback: cold-start a browser for this single render
        from playwright.async_api import async_playwright
        async with async_playwright() as pw:
            browser = await pw.chromium.launch(headless=True)
            context = await browser.new_context(
                viewport={"width": width, "height": height},
                device_scale_factor=1,
            )
            return await _do_render(context, html, width, height, output_path)


def render_poster(html: str, width: int, height: int, output_path: str) -> str:
    """Sync wrapper — safe to call from non-async contexts (scripts, tests)."""
    try:
        loop = asyncio.get_event_loop()
        if loop.is_running():
            import concurrent.futures
            with concurrent.futures.ThreadPoolExecutor() as pool:
                return pool.submit(
                    asyncio.run,
                    render_poster_async(html, width, height, output_path),
                ).result()
        return loop.run_until_complete(render_poster_async(html, width, height, output_path))
    except RuntimeError:
        return asyncio.run(render_poster_async(html, width, height, output_path))

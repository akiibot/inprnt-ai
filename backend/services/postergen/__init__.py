"""
Imprnt AI — PosterGen Engine

A self-contained poster-generation engine that lets Imagen 3 render the ENTIRE
poster (background + baked-in text) from a single rich prompt written by Gemini,
then composites the real logo and product image on top with Pillow.

This is the default generation engine. The legacy blueprint + HTML/Playwright
engine still lives under compositor/ and is selectable via the `engine` flag.

Public entry point: pipeline.generate_all_formats(...)
"""

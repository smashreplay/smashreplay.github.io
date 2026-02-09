# CLAUDE.md — Smash Replay Website

## Project Overview

**Smash Replay** is a marketing/landing-page website for a padel court camera replay system. It is hosted via **GitHub Pages** at `smashreplay.github.io`. The site is bilingual (Arabic primary on `index.html`, English on `page1.html`) and includes standalone basketball highlights detector tools.

## Repository Structure

```
/
├── index.html                        # Main landing page (Arabic)
├── page1.html                        # English landing page
├── basketball-highlights.html        # Basketball highlights detector (desktop)
├── basketball-highlights-phone.html  # Basketball highlights detector (mobile)
├── CLAUDE.md                         # This file
└── assets/
    ├── animatecss/animate.css        # CSS animations
    ├── bootstrap/                    # Bootstrap 5.1 (minified CSS + JS)
    ├── dropdown/                     # Navbar dropdown component
    ├── formoid/                      # Form handling (minified)
    ├── images/                       # Site images + hashes.json manifest
    ├── mobirise/css/                 # Mobirise theme overrides
    ├── smoothscroll/                 # Smooth scroll JS
    ├── socicon/                      # Social icon font
    ├── theme/                        # Main theme CSS + JS
    ├── web/assets/mobirise-icons2/   # Mobirise icon font
    └── ytplayer/                     # YouTube player embed JS
```

## Tech Stack & Build System

- **Static HTML/CSS/JS** — No build step, no bundler, no package manager
- **Mobirise Website Builder v5.9.6** — The landing pages (`index.html`, `page1.html`) were generated with Mobirise
- **Bootstrap 5.1** — Layout and component framework
- **GitHub Pages** — Deployment is automatic on push to the default branch
- **No CI/CD pipeline, no tests, no linters**

## Key Conventions

### HTML Pages
- `index.html` and `page1.html` are Mobirise-generated. They use Mobirise section IDs (e.g., `cid-tSPog7l9nn`) and `data-bs-version="5.1"` attributes. Edits to these files should preserve Mobirise markup patterns.
- `basketball-highlights.html` and `basketball-highlights-phone.html` are self-contained single-file apps (~2000 lines each) with inline `<style>` and `<script>` tags. They do NOT use Mobirise.
- The site is RTL for Arabic (`index.html`) — be careful with text direction when editing.

### Assets
- All assets live under `assets/` with vendor libraries kept in their own subdirectories.
- `assets/images/hashes.json` maps MD5 hashes to image filenames (used by Mobirise for asset tracking).
- Image filenames include dimensions (e.g., `tweener-96x96.png`, `court-phone-qr-camera-496x408.png`).

### Languages
- Arabic content is in `index.html`; English content is in `page1.html`.
- Navigation links between language versions use `page1.html` (from Arabic) and `index.html` (from English).

## Development Workflow

1. **No build required** — Edit HTML/CSS/JS files directly
2. **Preview** — Open HTML files in a browser (or use a local HTTP server)
3. **Deploy** — Push to the default branch; GitHub Pages serves the site automatically
4. **Mobirise pages** — If regenerating via Mobirise, the builder will overwrite `index.html`/`page1.html` entirely; manual edits to those files may be lost

## Important Notes for AI Assistants

- There is **no package.json**, no npm scripts, no test suite, and no linter config. Do not suggest running `npm install` or similar.
- The basketball highlights HTML files are large self-contained apps. When editing them, be precise with changes — avoid rewriting entire files.
- Mobirise-generated markup is verbose and heavily class-based. Preserve existing class names and section structure when making targeted edits.
- The `assets/` directory contains only vendored/static files — do not add build artifacts or node_modules here.
- Font loading uses `rel="preload"` with `onload` swap pattern for Google Fonts (Inter Tight family).
- Social icons use the Socicon font, not SVGs or image sprites.

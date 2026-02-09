# CLAUDE.md — Smash Replay Website

## Project Overview

**Smash Replay** is hosted via **GitHub Pages** at `smashreplay.github.io`. The site currently serves basketball highlights detector tools — self-contained single-page web apps that let users detect and clip highlight moments from basketball videos.

## Repository Structure

```
/
├── index.html                   # Basketball highlights detector (mobile)
├── basketball-highlights.html   # Basketball highlights detector (desktop)
└── CLAUDE.md                    # This file
```

## Tech Stack

- **Static HTML/CSS/JS** — No build step, no bundler, no package manager
- **GitHub Pages** — Deployment is automatic on push to the default branch
- **No CI/CD pipeline, no tests, no linters**

## Key Conventions

### HTML Pages
- `index.html` and `basketball-highlights.html` are self-contained single-file apps (~2000 lines each) with inline `<style>` and `<script>` tags.
- `index.html` is the mobile-optimized version; `basketball-highlights.html` is the desktop version.
- When editing these files, be precise with changes — avoid rewriting entire files.

## Development Workflow

1. **No build required** — Edit HTML/CSS/JS files directly
2. **Preview** — Open HTML files in a browser (or use a local HTTP server)
3. **Deploy** — Push to the default branch; GitHub Pages serves the site automatically

## Important Notes for AI Assistants

- There is **no package.json**, no npm scripts, no test suite, and no linter config. Do not suggest running `npm install` or similar.
- Both HTML files are large self-contained apps. Use targeted edits, not full file rewrites.
- There is no `assets/` directory — all styles and scripts are inlined in the HTML files.

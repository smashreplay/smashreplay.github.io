# CLAUDE.md — Smash Replay Website

# Project Standards: HTML Refactor

## Modularity Rules (Strict)
- **File Limit:** No single file should exceed 300 lines.
- **Extraction:** If a <div> or <section> exceeds 50 lines, it must be extracted into a separate component/partial.
- **CSS/JS:** No inline <style> or <script> tags. All logic and styling must live in `/css` and `/js` directories.

## Refactor Workflow
1. **Plan Mode:** Before editing, use `/plan` to outline which section is being extracted.
2. **Small Batches:** Only refactor one component at a time.
3. **Verification:** Check the UI after every file split to ensure no styles are broken.
4. **Context Management:** After a successful extraction and verification, remind the user to run `/clear`.

## Project Overview

**Smash Replay** is hosted via **GitHub Pages** at `smashreplay.github.io`. The site currently serves basketball highlights detector tools — self-contained single-page web apps that let users detect and clip highlight moments from basketball videos.

## Repository Structure

```
/
├── index.html                   # Basketball highlights detector (mobile)
├── CLAUDE.md                    # This file
├── css/                         # Extracted stylesheets
└── js/                          # Application logic (16 modules, all global scope)
    ├── state.js                 # Global state variables (loaded first)
    ├── utils.js                 # showStatus, formatTime, enablePlaybackControls
    ├── perf.js                  # Performance diagnostics & video warmup
    ├── motion-detection.js      # Frame differencing, EMA, basket scoring
    ├── chart.js                 # Motion chart rendering
    ├── timeline.js              # Timeline overlay PNG generation
    ├── highlights-display.js    # Thumbnail capture, highlight list UI
    ├── ffmpeg.js                # FFmpeg WASM loading, clip extraction
    ├── recovery.js              # Slow processing detection & retry
    ├── region-selection.js      # Canvas overlay, drag/resize handlers
    ├── region-management.js     # Region CRUD, guided workflow UI
    ├── playback.js              # Play/stop/navigate highlights, keyboard nav
    ├── export.js                # Single & multi-clip export with stitching
    ├── sharing.js               # Native share sheet integration
    ├── file-management.js       # Tab switching, file upload, video loading
    └── processing.js            # Main video processing loop
```

**JS load order matters:** `state.js` → `utils.js` → independent modules → dependent modules → `file-management.js` → `processing.js`. All functions are global scope with no imports/exports.

## Tech Stack

- **Static HTML/CSS/JS** — No build step, no bundler, no package manager
- **GitHub Pages** — Deployment is automatic on push to the default branch
- **No CI/CD pipeline, no tests, no linters**

## Key Conventions

### HTML Pages
- `index.html` is the mobile-optimized basketball highlights detector. JS logic lives in `js/` (16 files). CSS is being extracted to `css/`.
- When editing HTML files, be precise with changes — avoid rewriting entire files.

## Development Workflow

1. **No build required** — Edit HTML/CSS/JS files directly
2. **Preview** — Open HTML files in a browser (or use a local HTTP server)
3. **Deploy** — Push to the default branch; GitHub Pages serves the site automatically

## Important Notes for AI Assistants

- There is **no package.json**, no npm scripts, no test suite, and no linter config. Do not suggest running `npm install` or similar.
- Use targeted edits on HTML files, not full file rewrites.
- JS logic is split across 16 files in `js/` — all global scope, no build step.

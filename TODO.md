# TODO — Smash Replay

## Bugs

### 1. Brightness change triggers false basket detection
When someone gets close to the camera and the phone auto-adjusts brightness, the sudden frame-wide change is picked up as motion and triggers a false highlight. Need to filter out global brightness shifts (e.g., compare mean luminance delta vs. localized motion).

### 2. Clip counter stops counting at end / out of sync
The clip counter overlay (e.g., "3/5") sometimes stops updating before the video ends, or drifts out of sync with the actual clip transitions. Likely a timing mismatch — the `between(t, start, end)` ranges may not perfectly align with the actual segment boundaries after concat (segments may not be exactly 4.00s due to keyframe snapping).

### 3. Timeline bar still showing in exported video
The colored timeline overlay at the bottom is still present in exports. Confirm whether this is intentional or if users expect a cleaner output. (Note: the timeline was added deliberately — revisit if users find it distracting.)

## Feature Ideas

### 4. Split long exports into smaller videos on mobile
On phones, exporting many clips into one large stitched video can be slow and may crash the browser. Instead, split into batches (e.g., every 5 or 10 clips) and download each batch as a separate file. This reduces peak memory usage and gives the user usable files faster.

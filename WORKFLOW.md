# User Workflow — Smash Replay

Smash Replay is a browser-based tool that automatically detects made baskets in pickup basketball game videos. Everything runs client-side — no uploads, no servers. Users load a video, mark the basket location, and the app finds highlights using motion detection.

---

## Phase 1: Upload Video

**What the user sees:** A file input prompting "Upload a video file to get started."

**What the user does:** Selects or drags a video file onto the page.

**What happens:** The video loads into a player, seeks to the midpoint for a preview frame, and the app prepares for region selection. A hidden processing video element is also initialized for frame analysis.

---

## Phase 2: Select Court Type

**What the user sees:** A modal overlay with two options — **Half-Court** and **Full-Court (Beta)**.

**What the user does:** Taps one of the two options.

**What happens:** Half-court mode tracks one basket; full-court mode allows tracking two baskets (one at each end). The app then prompts the user to position a detection box over the basket.

---

## Phase 3: Select Basket Region(s)

**What the user sees:** A dark overlay on the video preview with a draggable, resizable box. Corner handles allow resizing. A trapezoid guide inside the box shows the active detection area (matching the hoop/net shape). Help text reads: "Drag the box over the basket, then drag corners to resize."

**What the user does:**
1. Drags the box to center it over the basket in the preview frame.
2. Resizes corners to fit the hoop area.
3. Taps **Confirm** to save the region.
4. (Full-court only) Optionally taps **Add Basket 2** and repeats for the second basket.

**What happens:** The region's position is saved as normalized coordinates (0–1 scale), so it works regardless of video resolution. A guided workflow panel appears with a **Start Detection** button.

---

## Phase 4: Detection

**What the user sees:** A progress bar, frame counter, "Baskets Found" counter, current video time, and a live motion chart. Highlights appear in a list below the video as they're detected.

**What the user does:** Taps **Start Detection** and waits. Playback starts automatically once the first highlight is found.

**What happens:** The app processes the video at 3 frames per second:
- Each frame is compared to the previous one to measure motion within the selected basket region(s).
- A dynamic threshold (exponential moving average) adapts to the video's baseline motion level.
- Short, sharp motion spikes (characteristic of a ball passing through the net) score highest. Sustained or oversized motion (a person walking by) is penalized.
- When a frame scores above the detection threshold, a thumbnail is captured and a highlight entry is created.
- A minimum 3-second gap prevents duplicate detections of the same basket.

If processing is slow (>1.5s per frame), the app automatically retries by reloading the video. After 3 silent retries, it shows a manual retry button.

---

## Phase 5: Review Highlights

**What the user sees:** A scrollable list of detected highlights, each showing:
- Thumbnail of the detection frame
- Timestamp (e.g., "0:12.5")
- Confidence score
- Detection reason (e.g., "Anomaly Burst")
- Toggle checkbox (enable/disable)
- Clip and Share buttons

A playback overlay on the video shows clip number, timestamp, and a progress bar.

**What the user does:**
- **Click a highlight** to jump to that moment in the video (plays 3 seconds before through 2 seconds after).
- **Toggle checkboxes** to include/exclude highlights from export.
- **Play All Highlights** to watch them in sequence.
- **Keyboard shortcuts:** Space (play/pause), Right arrow (next clip), Left arrow (previous clip).

**What happens:** The video seeks to each highlight's timestamp and plays a 5-second window around it. Clips loop back to the beginning after the last one.

---

## Phase 6: Export & Share

**What the user sees:** Export buttons below the highlights list, plus per-highlight Clip and Share buttons.

**What the user does (four options):**

1. **Copy Timestamps** — Copies a text list of timestamps and confidence scores to the clipboard.

2. **Download JSON** — Downloads a structured data file with all highlight details.

3. **Export Video Clips** — Extracts 5-second clips around each enabled highlight and stitches them into a single video with clip-number overlays. Uses FFmpeg WASM (~30 MB, downloaded once and cached). Single highlights can also be exported individually via the per-highlight Clip button.

4. **Share** — Opens the device's native share sheet (on supported browsers) with highlight info, or falls back to copying to the clipboard.

**What happens:** For video export, the app reads the original video file, trims clips with FFmpeg, concatenates them, and adds overlay counters (e.g., "1/5", "2/5"). The result downloads as an MP4 or WebM file matching the input format.

---

## Post-Detection Modal

After processing completes, a modal appears with quick-action buttons:
- **Download Highlight Reel** — triggers the multi-clip video export
- **Share via Link** — triggers the share flow

This provides a streamlined path to the most common next steps.

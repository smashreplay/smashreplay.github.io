// ─── Adaptive processing quality ───
// Picks the frame-capture resolution and sampling rate for the device, and
// downgrades resolution mid-run if early frames show the device is struggling.
// Detection thresholds are safe across resolutions: detectMotion returns
// per-pixel-normalized values and regions use normalized coordinates.

const QUALITY_FULL = { width: 320, height: 180, fps: 3 };
const QUALITY_REDUCED = { width: 240, height: 136, fps: 2 };

function initialProcessingQuality() {
    // deviceMemory is undefined on Safari and capped at 8 elsewhere — treat
    // <=4 GB or very few cores as a low-end device.
    const lowEnd = (navigator.deviceMemory && navigator.deviceMemory <= 4)
        || (navigator.hardwareConcurrency && navigator.hardwareConcurrency <= 2);
    const q = lowEnd ? QUALITY_REDUCED : QUALITY_FULL;
    if (lowEnd) {
        console.log(`[Quality] Low-end device — starting at ${q.width}x${q.height} @ ${q.fps}fps`);
    }
    return { ...q };
}

// Called once early in the processing loop. If measured frame times show the
// device is struggling and the canvas is still at full resolution, drop it to
// the reduced size. Returns true if the size changed (caller must invalidate
// its previous-frame buffer).
function maybeReduceQuality(canvas, avgFrameMs) {
    if (avgFrameMs <= 800) return false;
    if (canvas.width <= QUALITY_REDUCED.width) return false;
    canvas.width = QUALITY_REDUCED.width;
    canvas.height = QUALITY_REDUCED.height;
    console.log(`[Quality] Slow frames (${avgFrameMs.toFixed(0)}ms avg) — reducing capture to ${canvas.width}x${canvas.height}`);
    return true;
}

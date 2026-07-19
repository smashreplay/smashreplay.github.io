// Called when slow processing is detected — stops processing,
// reloads the video to populate the browser cache, then retries.
let _processingAborted = false;
let _userCancelled = false;    // Distinguishes user cancel from reloadAndRetry abort
let _slowRetryCount = 0;       // How many times we've auto-reloaded for slow processing
const _MAX_AUTO_RETRIES = 3;   // Auto-reload up to this many times before showing manual button

// User-facing cancel from the progress container. The processing loop checks
// the flag at the top of each iteration and restores the UI itself.
function cancelProcessing() {
    _userCancelled = true;
    _processingAborted = true;
}

function reloadAndRetry() {
    // Abort current processing loop
    _processingAborted = true;
    document.getElementById('processBtn').disabled = false;

    // Remove the slow banner
    const banner = document.getElementById('slowBanner');
    if (banner) banner.remove();

    _slowRetryCount++;
    showStatus(`Reloading video to warm up decoder... (attempt ${_slowRetryCount})`, 'processing');

    const video = document.getElementById('videoPlayer');
    const processingVideo = document.getElementById('processingVideo');

    // Re-set the source to force a fresh load from cache
    const src = video.src;
    video.src = '';
    processingVideo.src = '';

    // Small delay then reload
    setTimeout(() => {
        video.src = src;
        processingVideo.src = src;

        video.onloadedmetadata = () => {
            // Force first frame render on both
            video.currentTime = 0.001;
            processingVideo.currentTime = 0.001;

            showStatus(`Video reloaded (attempt ${_slowRetryCount}). Starting detection...`, 'complete');
            // Auto-start processing after a brief moment for decoder to settle
            setTimeout(() => processVideo(), 500);
        };
    }, 200);
}

// Slow-processing watchdog, called by processVideo after the first 2 frames.
// If the average frame time shows the device is crawling, auto-reload the
// video (up to _MAX_AUTO_RETRIES times) to warm the decoder cache, then fall
// back to a manual retry banner. Returns true when an auto-reload was
// triggered and the current processing run must exit.
function checkSlowProcessing(duration, interval) {
    if (document.getElementById('slowBanner')) return false;
    const avgFrame = perfAvg(perfStats.frame);
    if (avgFrame > 1500) {
        if (_slowRetryCount < _MAX_AUTO_RETRIES) {
            // Auto-reload silently for the first 3 attempts
            console.log(`[Perf] Slow processing detected (avg ${(avgFrame / 1000).toFixed(1)}s/frame). Auto-reloading (attempt ${_slowRetryCount + 1}/${_MAX_AUTO_RETRIES})...`);
            reloadAndRetry();
            return true;
        }
        // 4th time still slow — show manual button
        const totalFrames = Math.ceil(duration / interval);
        const estMinutes = ((totalFrames * avgFrame) / 60000).toFixed(0);
        const banner = document.createElement('div');
        banner.id = 'slowBanner';
        banner.className = 'slow-processing-banner';
        banner.innerHTML = `
            <p><strong>Slow processing detected</strong><br>
            Avg ${(avgFrame / 1000).toFixed(1)}s per frame — at this rate it would take ~${estMinutes} min.<br>
            Auto-reload didn't help after ${_MAX_AUTO_RETRIES} attempts. You can try once more or wait it out.</p>
            <button onclick="reloadAndRetry()">Reload Video & Retry</button>
        `;
        document.getElementById('progressContainer').appendChild(banner);
    } else if (_slowRetryCount > 0) {
        // Was slow before but now it's fast — the reload worked!
        console.log(`[Perf] Processing speed OK after ${_slowRetryCount} reload(s) (avg ${avgFrame.toFixed(0)}ms/frame).`);
    }
    return false;
}

// Resolves once the tab is visible again, returning how long it was hidden.
// The processing loop awaits this at the top of each iteration — background
// tabs throttle timers and may evict the video decoder, which otherwise
// cascades into seek timeouts and watchdog reload loops.
function waitUntilVisible() {
    if (!document.hidden) return Promise.resolve(0);
    console.log('[Recovery] Tab hidden — pausing processing until visible');
    const start = performance.now();
    return new Promise(resolve => {
        const onVisible = () => {
            if (!document.hidden) {
                document.removeEventListener('visibilitychange', onVisible);
                resolve(performance.now() - start);
            }
        };
        document.addEventListener('visibilitychange', onVisible);
    });
}

function skipToProcessing() {
    document.getElementById('setupGuide').style.display = 'none';
    // If no baskets selected yet, show the process button directly
    if (basketRegions.length === 0) {
        document.getElementById('processBtn').style.display = 'block';
        document.getElementById('processBtn').innerHTML = '<span>▶ Start Detection (Full Frame)</span>';
    }
    showStatus('You can still add basket regions before processing for better accuracy.', 'complete');
}

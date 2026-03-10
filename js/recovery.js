// Called when slow processing is detected — stops processing,
// reloads the video to populate the browser cache, then retries.
let _processingAborted = false;
let _slowRetryCount = 0;       // How many times we've auto-reloaded for slow processing
const _MAX_AUTO_RETRIES = 3;   // Auto-reload up to this many times before showing manual button

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

    // Small delay then reload — wait for BOTH video elements before retrying
    setTimeout(() => {
        video.src = src;
        processingVideo.src = src;

        let mainReady = false;
        let procReady = false;
        let started = false;

        function startProcessing() {
            if (started) return;
            started = true;
            showStatus(`Video reloaded (attempt ${_slowRetryCount}). Starting detection...`, 'complete');
            setTimeout(() => processVideo(), 300);
        }

        function onBothReady() {
            if (!mainReady || !procReady) return;

            // Force first frame render on both
            video.currentTime = 0.001;
            processingVideo.currentTime = 0.001;

            // Wait for processingVideo to actually decode a frame before starting
            processingVideo.addEventListener('seeked', () => startProcessing(), { once: true });

            // Safety timeout in case seeked never fires
            setTimeout(() => startProcessing(), 5000);
        }

        video.onloadedmetadata = () => { mainReady = true; onBothReady(); };
        processingVideo.onloadedmetadata = () => { procReady = true; onBothReady(); };

        // Safety: if processingVideo is very slow, don't block forever
        setTimeout(() => {
            if (!procReady) {
                console.warn('[Recovery] processingVideo metadata timeout');
                procReady = true;
                onBothReady();
            }
        }, 8000);
    }, 200);
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

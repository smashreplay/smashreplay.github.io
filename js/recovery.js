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

function skipToProcessing() {
    document.getElementById('setupGuide').style.display = 'none';
    // If no baskets selected yet, show the process button directly
    if (basketRegions.length === 0) {
        document.getElementById('processBtn').style.display = 'block';
        document.getElementById('processBtn').innerHTML = '<span>▶ Start Detection (Full Frame)</span>';
    }
    showStatus('You can still add basket regions before processing for better accuracy.', 'complete');
}

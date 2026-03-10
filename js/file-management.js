function handleFileUpload(event) {
    const file = event.target.files[0];
    if (file) {
        videoFile = file;
        loadVideo();
    }
}

function loadVideo() {
    if (!videoFile) {
        showStatus('Please select a video file.', 'error');
        return;
    }

    const video = document.getElementById('videoPlayer');
    const processingVideo = document.getElementById('processingVideo');
    const url = URL.createObjectURL(videoFile);

    video.removeAttribute('crossorigin');
    processingVideo.removeAttribute('crossorigin');
    video.src = url;
    processingVideo.src = url;

    // Wait for BOTH video elements to have metadata before proceeding.
    // On mobile, processingVideo may lag behind videoPlayer.
    let videoPlayerReady = false;
    let processingVideoReady = false;

    function onBothReady() {
        if (!videoPlayerReady || !processingVideoReady) return;

        document.getElementById('emptyState').style.display = 'none';
        document.getElementById('videoSection').style.display = 'grid';
        highlights = [];
        basketRegions = [];
        courtType = null;
        // (video data is read fresh each export — no cache to clear)
        _slowRetryCount = 0;       // Reset slow-processing retry counter
        updateHighlightsDisplay();
        updateRegionDisplay();

        // Initialize selection canvas
        initSelectionCanvas();

        // Set up keyboard navigation
        setupKeyboardNavigation();

        // Seek to the middle of the video so the user gets a useful frame
        const midTime = Math.min(video.duration / 2, video.duration - 0.1);
        video.currentTime = midTime;
        processingVideo.currentTime = 0.001; // processing video just needs decoder warm-up

        // Show court type prompt before starting region selection
        showCourtTypePrompt(function () {
            // By the time the user picks a court type, the mid-video seek has already completed
            if (basketRegions.length === 0 && !isSelectingRegion) {
                toggleRegionSelection();
            }
            showStatus('Position the box over the basket, then tap Confirm.', 'complete');
        });
    }

    video.onloadedmetadata = () => {
        videoPlayerReady = true;
        onBothReady();
    };

    processingVideo.onloadedmetadata = () => {
        processingVideoReady = true;
        onBothReady();
    };

    // Safety timeout: if processingVideo hasn't loaded after 5s, proceed anyway
    // (the warmup in processing.js will handle further waiting)
    setTimeout(() => {
        if (!processingVideoReady) {
            console.warn('[Load] processingVideo metadata timeout — proceeding anyway');
            processingVideoReady = true;
            onBothReady();
        }
    }, 5000);

    video.onerror = () => {
        showStatus('Error loading video. Check the file format.', 'error');
    };

    processingVideo.onerror = () => {
        console.error('[Load] processingVideo failed to load');
    };
}

function updateSettings() {
    // Settings UI removed — minGap uses default value
}

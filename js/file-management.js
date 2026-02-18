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

    video.onloadedmetadata = () => {
        document.getElementById('emptyState').style.display = 'none';
        document.getElementById('videoSection').style.display = 'grid';
        highlights = [];
        basketRegions = [];
        // (video data is read fresh each export — no cache to clear)
        _slowRetryCount = 0;       // Reset slow-processing retry counter
        updateHighlightsDisplay();
        updateRegionDisplay();

        // Initialize selection canvas
        initSelectionCanvas();

        // Set up keyboard navigation
        setupKeyboardNavigation();

        // Seek to the middle of the video so the user gets a useful frame
        // for placing the basket region, then auto-open region selection.
        const midTime = Math.min(video.duration / 2, video.duration - 0.1);
        video.currentTime = midTime;
        processingVideo.currentTime = 0.001; // processing video just needs decoder warm-up

        video.addEventListener('seeked', function onMidSeek() {
            video.removeEventListener('seeked', onMidSeek);
            // Auto-start region selection so the overlay box appears immediately
            if (basketRegions.length === 0 && !isSelectingRegion) {
                toggleRegionSelection();
            }
        });

        showStatus('Position the box over the basket, then tap Confirm.', 'complete');
    };

    video.onerror = () => {
        showStatus('Error loading video. Check the file format.', 'error');
    };
}

function updateSettings() {
    // Settings UI removed — minGap uses default value
}

function switchTab(tab) {
    currentTab = tab;
    document.getElementById('fileTab').classList.toggle('active', tab === 'file');
    document.getElementById('urlTab').classList.toggle('active', tab === 'url');
    document.getElementById('fileInput').style.display = tab === 'file' ? 'block' : 'none';
    document.getElementById('urlInput').style.display = tab === 'url' ? 'block' : 'none';
}

function handleFileUpload(event) {
    const file = event.target.files[0];
    if (file) {
        videoFile = file;
        loadVideo();
    }
}

function loadVideo() {
    const video = document.getElementById('videoPlayer');
    const processingVideo = document.getElementById('processingVideo');

    if (currentTab === 'file' && videoFile) {
        const url = URL.createObjectURL(videoFile);
        video.removeAttribute('crossorigin');
        processingVideo.removeAttribute('crossorigin');
        video.src = url;
        processingVideo.src = url;
    } else if (currentTab === 'url') {
        let url = document.getElementById('videoUrl').value.trim();
        if (!url) {
            showStatus('Please enter a video URL.', 'error');
            return;
        }

        // Handle Google Drive links
        const isGoogleDrive = url.includes('drive.google.com') || url.includes('drive.usercontent.google.com');
        if (isGoogleDrive) {
            const fileId = extractGoogleDriveId(url);
            if (fileId) {
                url = `https://drive.usercontent.google.com/download?id=${fileId}&export=download&confirm=t`;
            } else {
                showStatus('Could not extract file ID from Google Drive link. Make sure the link is a valid sharing URL.', 'error');
                return;
            }
        }

        showStatus('Loading video...', 'processing');

        video.src = url;
        processingVideo.src = url;
    }

    // Timeout for URL loading
    let loadTimeout = null;
    if (currentTab === 'url') {
        loadTimeout = setTimeout(() => {
            const isGD = document.getElementById('videoUrl').value.includes('drive.google');
            if (isGD) {
                showStatus('Google Drive video is taking too long to load. The file may not be publicly shared, or Google may be blocking direct access. Try downloading the video and uploading it as a local file instead.', 'error');
            } else {
                showStatus('Video is taking too long to load. Check the URL and try again.', 'error');
            }
        }, 20000);
    }

    video.onloadedmetadata = () => {
        if (loadTimeout) clearTimeout(loadTimeout);
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

        // Force first frame to render (prevents black preview on mobile).
        // A black preview means the decoder hasn't parsed the video data yet,
        // which would cause extremely slow seeking during processing.
        video.currentTime = 0.001;
        processingVideo.currentTime = 0.001;

        showStatus('Video loaded successfully! Select basket regions to start.', 'complete');
    };

    video.onerror = () => {
        if (loadTimeout) clearTimeout(loadTimeout);
        const urlInput = document.getElementById('videoUrl').value || '';
        if (urlInput.includes('drive.google')) {
            showStatus('Could not load Google Drive video. Make sure the file is set to "Anyone with the link can view" and try again. If it still fails, download the video and upload it as a local file.', 'error');
        } else {
            showStatus('Error loading video. Check the URL or file format.', 'error');
        }
    };
}

function extractGoogleDriveId(url) {
    const patterns = [
        /\/d\/([a-zA-Z0-9-_]+)/,
        /id=([a-zA-Z0-9-_]+)/,
        /\/file\/d\/([a-zA-Z0-9-_]+)/
    ];

    for (const pattern of patterns) {
        const match = url.match(pattern);
        if (match) return match[1];
    }
    return null;
}

function updateSettings() {
    // Settings UI removed — minGap uses default value
}

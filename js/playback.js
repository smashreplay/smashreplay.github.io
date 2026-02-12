function jumpToHighlight(timestamp) {
    const video = document.getElementById('videoPlayer');
    const startTime = Math.max(0, timestamp - 3); // Start 3 seconds before
    const endTime = timestamp + 1; // Stop 1 second after

    video.currentTime = startTime;
    video.play();

    // Set up listener to stop at end time
    const stopListener = () => {
        if (video.currentTime >= endTime) {
            video.pause();
            video.removeEventListener('timeupdate', stopListener);
        }
    };

    video.addEventListener('timeupdate', stopListener);
}

function exportTimestamps() {
    const enabled = getEnabledHighlights();
    const text = enabled.map((h, i) =>
        `${i + 1}. ${formatTime(h.timestamp)} (${Math.round(h.confidence)}% confidence)`
    ).join('\n');

    navigator.clipboard.writeText(text).then(() => {
        showStatus(`${enabled.length} timestamp(s) copied to clipboard!`, 'complete');
    });
}

function exportJSON() {
    const enabled = getEnabledHighlights();
    const data = {
        videoSource: currentTab === 'file' ? 'local file' : document.getElementById('videoUrl').value,
        processedDate: new Date().toISOString(),
        totalHighlights: enabled.length,
        highlights: enabled.map((h, i) => ({
            number: i + 1,
            timestamp: h.timestamp,
            formattedTime: formatTime(h.timestamp),
            confidence: Math.round(h.confidence)
        }))
    };

    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `basketball-highlights-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
}

function playPreviousClip() {
    const prev = findPrevEnabledIndex(currentHighlightIndex - 1);
    if (prev >= 0) {
        currentHighlightIndex = prev;
        playNextHighlight();
    }
}

function playNextClip() {
    let next = findNextEnabledIndex(currentHighlightIndex + 1);
    if (next < 0) {
        // Loop back to start
        next = findNextEnabledIndex(0);
    }
    if (next >= 0) {
        currentHighlightIndex = next;
        playNextHighlight();
    }
}

function playAllHighlights() {
    const enabled = getEnabledHighlights();
    if (enabled.length === 0) return;

    isPlayingAll = true;
    currentHighlightIndex = 0;

    // Skip to first enabled highlight
    while (currentHighlightIndex < highlights.length && highlights[currentHighlightIndex].enabled === false) {
        currentHighlightIndex++;
    }

    playNextHighlight();
}

function findNextEnabledIndex(fromIndex) {
    for (let i = fromIndex; i < highlights.length; i++) {
        if (highlights[i].enabled !== false) return i;
    }
    return -1;
}

function findPrevEnabledIndex(fromIndex) {
    for (let i = fromIndex; i >= 0; i--) {
        if (highlights[i].enabled !== false) return i;
    }
    return -1;
}

function playNextHighlight() {
    // Skip disabled highlights
    if (isPlayingAll && currentHighlightIndex < highlights.length && highlights[currentHighlightIndex].enabled === false) {
        currentHighlightIndex = findNextEnabledIndex(currentHighlightIndex);
    }

    if (!isPlayingAll || currentHighlightIndex < 0 || currentHighlightIndex >= highlights.length) {
        stopPlayingAll();
        return;
    }

    const highlight = highlights[currentHighlightIndex];
    const video = document.getElementById('videoPlayer');
    const enabledList = getEnabledHighlights();
    const enabledIdx = enabledList.indexOf(highlight);

    // Show overlay
    const overlay = document.getElementById('videoOverlay');
    overlay.style.display = 'block';
    document.getElementById('overlayClipNumber').textContent = enabledIdx + 1;
    document.getElementById('overlayTotalClips').textContent = enabledList.length;
    document.getElementById('overlayTimestamp').textContent = formatTime(highlight.timestamp);

    // Highlight the current item in the list
    document.querySelectorAll('.highlight-item').forEach((item, idx) => {
        item.classList.toggle('playing', idx === currentHighlightIndex);
    });

    // Scroll to current highlight in theater mode WITHOUT focus jump
    if (isTheaterMode) {
        const currentItem = document.querySelectorAll('.highlight-item')[currentHighlightIndex];
        if (currentItem) {
            const container = document.getElementById('highlightsList');
            const itemRect = currentItem.getBoundingClientRect();
            const containerRect = container.getBoundingClientRect();

            // Calculate scroll position to center the item
            const scrollLeft = currentItem.offsetLeft - (containerRect.width / 2) + (itemRect.width / 2);
            container.scrollLeft = scrollLeft;
        }
    }

    const startTime = Math.max(0, highlight.timestamp - 3);
    const endTime = highlight.timestamp + 1;
    const clipDuration = endTime - startTime;

    document.getElementById('overlayClipDuration').textContent = clipDuration.toFixed(1) + 's';

    video.currentTime = startTime;
    video.play();

    // Remove any existing listener
    if (playAllListener) {
        video.removeEventListener('timeupdate', playAllListener);
    }

    // Set up listener to move to next highlight and update progress
    playAllListener = () => {
        const elapsed = video.currentTime - startTime;
        const progress = Math.min(100, (elapsed / clipDuration) * 100);

        // Update overlay progress
        document.getElementById('overlayProgress').style.width = progress + '%';
        document.getElementById('overlayClipTime').textContent = elapsed.toFixed(1) + 's';

        if (video.currentTime >= endTime) {
            video.removeEventListener('timeupdate', playAllListener);
            // Find next enabled highlight
            currentHighlightIndex = findNextEnabledIndex(currentHighlightIndex + 1);

            // Small pause between highlights
            setTimeout(() => {
                if (isPlayingAll) {
                    playNextHighlight();
                }
            }, 300);
        }
    };

    video.addEventListener('timeupdate', playAllListener);
}

function stopPlayingAll() {
    isPlayingAll = false;
    const video = document.getElementById('videoPlayer');

    if (playAllListener) {
        video.removeEventListener('timeupdate', playAllListener);
        playAllListener = null;
    }

    video.pause();

    // Hide overlay
    document.getElementById('videoOverlay').style.display = 'none';

    // Remove playing class from all items
    document.querySelectorAll('.highlight-item').forEach(item => {
        item.classList.remove('playing');
    });
}

function setupKeyboardNavigation() {
    document.addEventListener('keydown', (e) => {
        // Only handle if we have highlights and not typing in an input
        if (highlights.length === 0 || e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') {
            return;
        }

        const video = document.getElementById('videoPlayer');

        switch(e.key) {
            case 'ArrowRight':
                e.preventDefault();
                playNextClip();
                break;

            case 'ArrowLeft':
                e.preventDefault();
                playPreviousClip();
                break;

            case ' ':
                e.preventDefault();
                if (video.paused) {
                    if (!isPlayingAll && highlights.length > 0) {
                        playAllHighlights();
                    } else {
                        video.play();
                    }
                } else {
                    video.pause();
                }
                break;
        }
    });
}

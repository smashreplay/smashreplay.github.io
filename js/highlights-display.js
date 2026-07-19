function captureThumbnail(video) {
    // Capture the current video frame as a JPEG blob and return an object
    // URL — blob memory lives outside the JS heap (unlike base64 data URLs)
    // and is explicitly revoked when highlights are discarded.
    return new Promise(resolve => {
        const thumbCanvas = document.createElement('canvas');
        thumbCanvas.width = 320;
        thumbCanvas.height = 180;
        thumbCanvas.getContext('2d').drawImage(video, 0, 0, 320, 180);
        thumbCanvas.toBlob(
            blob => resolve(blob ? URL.createObjectURL(blob) : null),
            'image/jpeg', 0.8
        );
    });
}

// Free all thumbnail blob URLs. Must be called before highlights is reset.
function revokeHighlightThumbnails() {
    highlights.forEach(h => {
        if (h.thumbnail) URL.revokeObjectURL(h.thumbnail);
    });
}

function getEnabledHighlights() {
    return highlights.filter(h => h.enabled !== false);
}

function toggleHighlight(index, event) {
    event.stopPropagation();
    highlights[index].enabled = !highlights[index].enabled;
    // Flip the one item in place — no full list re-render
    const item = document.getElementById('highlightsList').children[index];
    if (item) item.classList.toggle('disabled', !highlights[index].enabled);
    updateHighlightCounts();
}

function renderHighlightItem(h, i, canShare) {
    const reasons = h.reasons ? h.reasons.join(', ') : 'Unknown';
    const debugData = h.debugData || {};
    const isEnabled = h.enabled !== false;
    const disabledClass = isEnabled ? '' : ' disabled';

    return `
    <div class="highlight-item${disabledClass}" onclick="jumpToHighlight(${h.timestamp})" title="Click to play">
        ${h.thumbnail ? `
            <div class="highlight-thumbnail">
                <img src="${h.thumbnail}" alt="Basket at ${formatTime(h.timestamp)}">
                <div class="play-icon">▶</div>
            </div>
        ` : ''}
        <div class="highlight-number">${i + 1}</div>
        <div class="highlight-info">
            <div style="display: flex; justify-content: space-between; align-items: center;">
                <div class="highlight-time">${formatTime(h.timestamp)}</div>
                <label class="highlight-toggle" onclick="event.stopPropagation()">
                    <input type="checkbox" ${isEnabled ? 'checked' : ''} onchange="toggleHighlight(${i}, event)">
                    <span class="toggle-slider"></span>
                </label>
            </div>
            <div>
                <span class="confidence">Score: ${Math.round(h.confidence)}</span>
            </div>
            <div style="font-size: 10px; color: #667eea; margin-top: 4px;">
                ${reasons}
            </div>
            ${debugData.motion !== undefined ? `
            <div style="font-size: 9px; color: #999; margin-top: 4px; font-family: monospace;">
                M:${debugData.motion.toFixed(1)}
                R:${debugData.rim.toFixed(1)}
                B:${debugData.ball.toFixed(1)}
                ${debugData.motionDrop ? '📉' : ''}
                ${debugData.rimVisible ? '🎯' : ''}
                ${debugData.ballPresent ? '🏀' : ''}
            </div>
            ` : ''}
            <div class="highlight-actions" onclick="event.stopPropagation()">
                <button onclick="exportSingleClip(${i})" title="Export this clip">🎬 Clip</button>
                ${canShare ? `<button onclick="shareSingleHighlight(${i})" title="Share this highlight">📤 Share</button>` : ''}
                ${currentUser ? `<button class="drive-btn" onclick="triggerDriveForClip(${i})" title="Export &amp; save to Drive">☁ Drive</button>` : ''}
            </div>
            ${currentUser ? `<div id="drive-clip-status-${i}" class="drive-status" style="display:none;"></div>` : ''}
        </div>
    </div>
`;
}

function updateHighlightsDisplay() {
    const section = document.getElementById('highlightsSection');
    const list = document.getElementById('highlightsList');

    if (highlights.length === 0) {
        section.style.display = 'none';
        list.innerHTML = '';
        return;
    }

    section.style.display = 'block';

    const canShare = !!navigator.share;
    const shareBtn = document.getElementById('shareBtn');
    if (shareBtn) shareBtn.style.display = canShare ? 'inline-flex' : 'none';

    // Incremental render: during detection, highlights only ever append, so
    // build DOM for the new items only. Re-parsing the whole list via
    // innerHTML re-decoded every thumbnail on each detection — O(n²) over a
    // long game. A shrunk list (reset) triggers a full rebuild.
    if (list.children.length > highlights.length) list.innerHTML = '';
    for (let i = list.children.length; i < highlights.length; i++) {
        list.insertAdjacentHTML('beforeend', renderHighlightItem(highlights[i], i, canShare));
    }

    updateHighlightCounts();

    // Enable playback controls when highlights are available
    enablePlaybackControls();
}

function updateHighlightCounts() {
    const count = document.getElementById('highlightCount');
    const enabledCount = getEnabledHighlights().length;
    count.textContent = enabledCount + ' of ' + highlights.length + (highlights.length === 1 ? ' basket' : ' baskets');

    // Show Play All button when enabled highlights are available
    const playAllBtn = document.getElementById('playAllBtn');
    if (playAllBtn) {
        playAllBtn.style.display = enabledCount > 0 ? 'block' : 'none';
    }
}

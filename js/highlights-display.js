function captureThumbnail(video, canvas, ctx, detectionData) {
    // Capture full video frame as thumbnail
    const thumbCanvas = document.createElement('canvas');
    thumbCanvas.width = 320;
    thumbCanvas.height = 180;
    const thumbCtx = thumbCanvas.getContext('2d');
    thumbCtx.drawImage(video, 0, 0, 320, 180);

    return thumbCanvas.toDataURL('image/jpeg', 0.8);
}

function getEnabledHighlights() {
    return highlights.filter(h => h.enabled !== false);
}

function toggleHighlight(index, event) {
    event.stopPropagation();
    highlights[index].enabled = !highlights[index].enabled;
    updateHighlightsDisplay();
}

function updateHighlightsDisplay() {
    const section = document.getElementById('highlightsSection');
    const list = document.getElementById('highlightsList');
    const count = document.getElementById('highlightCount');

    if (highlights.length === 0) {
        section.style.display = 'none';
        return;
    }

    section.style.display = 'block';
    const enabledCount = getEnabledHighlights().length;
    count.textContent = enabledCount + ' of ' + highlights.length + (highlights.length === 1 ? ' basket' : ' baskets');

    const canShare = !!navigator.share;
    const shareBtn = document.getElementById('shareBtn');
    if (shareBtn) shareBtn.style.display = canShare ? 'inline-flex' : 'none';

    list.innerHTML = highlights.map((h, i) => {
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
                </div>
            </div>
        </div>
    `}).join('');

    // Show Play All button when highlights are available
    const playAllBtn = document.getElementById('playAllBtn');
    if (playAllBtn) {
        playAllBtn.style.display = enabledCount > 0 ? 'block' : 'none';
    }

    // Enable playback controls when highlights are available
    enablePlaybackControls();
}

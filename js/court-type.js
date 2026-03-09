function showCourtTypePrompt(onSelected) {
    const overlay = document.getElementById('courtTypeOverlay');
    overlay.classList.add('active');

    // Store callback for after selection
    overlay._onSelected = onSelected;
}

function selectCourtType(type) {
    courtType = type;

    const overlay = document.getElementById('courtTypeOverlay');
    overlay.classList.remove('active');

    // Update the region indicator to show court type
    updateCourtTypeIndicator();

    // Fire the callback that continues the video load flow
    if (overlay._onSelected) {
        overlay._onSelected(type);
        overlay._onSelected = null;
    }
}

function updateCourtTypeIndicator() {
    const indicator = document.getElementById('courtTypeTag');
    if (!indicator) return;

    if (courtType === 'half') {
        indicator.textContent = 'Half-Court';
        indicator.className = 'court-type-indicator half';
        indicator.style.display = 'inline-block';
    } else if (courtType === 'full') {
        indicator.textContent = 'Full-Court (Beta)';
        indicator.className = 'court-type-indicator full';
        indicator.style.display = 'inline-block';
    } else {
        indicator.style.display = 'none';
    }
}

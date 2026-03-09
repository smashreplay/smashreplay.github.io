// post-detection-modal.js
// Shown after processing completes — lets the user Download or Share their reel.
// Depends on: state.js (UPLOAD_BACKEND_URL), highlights-display.js
//             (getEnabledHighlights), export.js (exportClip), utils.js (showStatus)

function showPostDetectionModal() {
    const overlay = document.getElementById('postDetectionOverlay');
    if (!overlay) return;

    // Update clip count
    const count = getEnabledHighlights().length;
    document.getElementById('postDetectionCount').textContent = count;

    // Configure Share button based on whether backend is configured
    const shareBtn = document.getElementById('postDetectionShareBtn');
    const existingBadge = shareBtn.querySelector('.coming-soon-badge');
    if (existingBadge) existingBadge.remove();

    if (!UPLOAD_BACKEND_URL) {
        shareBtn.disabled = true;
        shareBtn.classList.add('coming-soon');
        const badge = document.createElement('span');
        badge.className = 'coming-soon-badge';
        badge.textContent = 'Coming soon';
        shareBtn.appendChild(badge);
    } else {
        shareBtn.disabled = false;
        shareBtn.classList.remove('coming-soon');
    }

    overlay.classList.add('active');
    document.addEventListener('keydown', _onPostDetectionKeydown);
    overlay.addEventListener('click', _onPostDetectionBackdropClick);
}

function closePostDetectionModal() {
    const overlay = document.getElementById('postDetectionOverlay');
    if (!overlay) return;
    overlay.classList.remove('active');
    document.removeEventListener('keydown', _onPostDetectionKeydown);
    overlay.removeEventListener('click', _onPostDetectionBackdropClick);
}

function _onPostDetectionKeydown(e) {
    if (e.key === 'Escape') closePostDetectionModal();
}

function _onPostDetectionBackdropClick(e) {
    if (e.target === document.getElementById('postDetectionOverlay')) {
        closePostDetectionModal();
    }
}

function handlePostDetectionDownload() {
    closePostDetectionModal();
    // exportClip() manages its own FFmpeg loading overlay
    exportClip();
}

async function handlePostDetectionShare() {
    if (!UPLOAD_BACKEND_URL) {
        showStatus('Share via link is coming soon!', 'warning');
        return;
    }

    const shareBtn = document.getElementById('postDetectionShareBtn');
    const originalLabel = shareBtn.querySelector('#postDetectionShareLabel').textContent;
    shareBtn.disabled = true;
    shareBtn.querySelector('#postDetectionShareLabel').textContent = 'Uploading...';

    try {
        // Build the stitched reel blob via FFmpeg, then POST it
        const blob = await buildHighlightReelBlob();
        if (!blob) throw new Error('Failed to build highlight reel.');

        const formData = new FormData();
        formData.append('video', blob, 'highlights.mp4');

        const response = await fetch(`${UPLOAD_BACKEND_URL}/upload`, {
            method: 'POST',
            body: formData
        });

        if (!response.ok) throw new Error(`Upload failed (${response.status})`);

        const { id } = await response.json();
        if (!id) throw new Error('Server did not return a replay ID.');

        const shareUrl = `${location.origin}/watch?id=${encodeURIComponent(id)}`;

        closePostDetectionModal();

        if (navigator.share) {
            await navigator.share({ title: 'Basketball Highlights', url: shareUrl });
        } else {
            await navigator.clipboard.writeText(shareUrl);
            showStatus('Share link copied to clipboard!', 'complete');
        }
    } catch (err) {
        console.error('[Share] Upload failed:', err);
        showStatus(`Share failed: ${err.message}`, 'error');
        shareBtn.disabled = false;
        shareBtn.querySelector('#postDetectionShareLabel').textContent = originalLabel;
    }
}

// Returns a Blob of the stitched highlight reel, or null on failure.
// Delegates to exportClip's underlying FFmpeg logic if available,
// otherwise falls back to the raw video file for single-clip cases.
async function buildHighlightReelBlob() {
    // exportClip() triggers a download — for sharing we need the raw blob.
    // This is a forward-compatible stub; wiring to FFmpeg internals is done
    // when the backend is live. For now, returns null (Share is "coming soon").
    return null;
}

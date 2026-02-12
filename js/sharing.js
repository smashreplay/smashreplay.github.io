// ─── Native Share Sheet ───

async function shareSingleHighlight(index) {
    const highlight = highlights[index];
    const text = `Basketball Highlight #${index + 1} at ${formatTime(highlight.timestamp)} (Score: ${Math.round(highlight.confidence)})`;

    // Try sharing with video clip if FFmpeg is available
    if (navigator.canShare && videoFile) {
        try {
            const loaded = await loadFFmpeg();
            if (loaded) {
                const blob = await extractClip(highlight);
                if (blob) {
                    const ext = guessVideoExtension();
                    const file = new File([blob], `highlight-${index + 1}.${ext}`, { type: blob.type });
                    const shareData = { text, files: [file] };

                    if (navigator.canShare(shareData)) {
                        await navigator.share(shareData);
                        return;
                    }
                }
            }
        } catch (err) {
            if (err.name === 'AbortError') return; // User cancelled
            console.warn('File share failed, falling back to text share:', err);
        }
    }

    // Fallback: share text only
    try {
        await navigator.share({ text });
    } catch (err) {
        if (err.name !== 'AbortError') {
            // Final fallback: copy to clipboard
            navigator.clipboard.writeText(text).then(() => {
                showStatus('Highlight info copied to clipboard!', 'complete');
            });
        }
    }
}

async function shareHighlights() {
    const enabled = getEnabledHighlights();
    if (enabled.length === 0) {
        showStatus('No enabled highlights to share.', 'error');
        return;
    }

    const lines = enabled.map((h, i) =>
        `${i + 1}. ${formatTime(h.timestamp)} (Score: ${Math.round(h.confidence)})`
    );
    const text = `Basketball Highlights (${enabled.length} clips):\n${lines.join('\n')}`;

    try {
        await navigator.share({ text });
    } catch (err) {
        if (err.name !== 'AbortError') {
            navigator.clipboard.writeText(text).then(() => {
                showStatus('Highlights copied to clipboard!', 'complete');
            });
        }
    }
}

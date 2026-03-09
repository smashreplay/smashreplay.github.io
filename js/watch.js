// watch.js — powers /watch?id=xxx
// Reads the replay ID from the URL, fetches the video from the backend,
// and renders it in the native <video> player.
//
// NOTE: Keep WATCH_BACKEND_URL in sync with UPLOAD_BACKEND_URL in js/state.js.
const WATCH_BACKEND_URL = '';

document.addEventListener('DOMContentLoaded', function () {
    const params = new URLSearchParams(location.search);
    const id = params.get('id');

    if (!id) {
        showWatchError('No replay ID was provided. The link may be incomplete.');
        return;
    }

    if (!WATCH_BACKEND_URL) {
        showWatchError('Replay sharing is not yet available. Check back soon!');
        return;
    }

    fetchReplay(id);
});

async function fetchReplay(id) {
    try {
        const response = await fetch(`${WATCH_BACKEND_URL}/replay/${encodeURIComponent(id)}`);

        if (response.status === 404) {
            showWatchError('This replay was not found. It may have expired or the link may be incorrect.');
            return;
        }

        if (!response.ok) {
            showWatchError(`Could not load the replay (${response.status}). Check your connection and try again.`);
            return;
        }

        const data = await response.json();

        if (!data.videoUrl) {
            showWatchError('The server returned an unexpected response. Please try again later.');
            return;
        }

        showWatchPlayer(data.videoUrl);

    } catch (err) {
        console.error('[watch] Fetch error:', err);
        showWatchError('Could not reach the server. Check your connection and try again.');
    }
}

function showWatchPlayer(videoUrl) {
    document.getElementById('watchLoading').style.display = 'none';

    const video = document.getElementById('watchVideo');
    video.src = videoUrl;

    document.getElementById('watchPlayer').style.display = 'flex';
}

function showWatchError(message) {
    document.getElementById('watchLoading').style.display = 'none';

    document.getElementById('watchErrorMsg').textContent = message;
    document.getElementById('watchError').style.display = 'block';
}

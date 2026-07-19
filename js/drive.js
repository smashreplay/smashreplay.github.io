// Google Drive integration — uploads exported clips to the signed-in user's Drive.
// Depends on: state.js (currentUser, driveTokenClient, driveAccessToken, driveTokenExpiry),
//             utils.js (showStatus), ffmpeg.js (extractClip, guessVideoExtension),
//             highlights-display.js (highlights), utils.js (formatTime)

let pendingDriveCallback = null;

function initDriveTokenClient() {
    if (typeof google === 'undefined' || !google.accounts || !google.accounts.oauth2) return;
    driveTokenClient = google.accounts.oauth2.initTokenClient({
        client_id: GOOGLE_CLIENT_ID,
        scope: 'https://www.googleapis.com/auth/drive.file',
        callback: handleDriveTokenResponse
    });
}

function handleDriveTokenResponse(tokenResponse) {
    if (tokenResponse.error) {
        driveAccessToken = null;
        driveTokenExpiry = 0;
        showStatus('Drive access denied.', 'error');
        pendingDriveCallback = null;
        return;
    }
    driveAccessToken = tokenResponse.access_token;
    driveTokenExpiry = Date.now() + (tokenResponse.expires_in - 60) * 1000;
    if (pendingDriveCallback) {
        const cb = pendingDriveCallback;
        pendingDriveCallback = null;
        cb();
    }
}

function requestDriveToken(onReady) {
    if (driveAccessToken && Date.now() < driveTokenExpiry) {
        onReady();
        return;
    }
    pendingDriveCallback = onReady;
    driveTokenClient.requestAccessToken({ prompt: driveAccessToken ? '' : 'consent' });
}

async function uploadToDrive(blob, filename, onProgress) {
    const mimeType = blob.type || 'video/mp4';
    const boundary = 'smashreplay_' + Date.now();
    const metadata = JSON.stringify({ name: filename, mimeType: mimeType });
    const enc = new TextEncoder();
    const headerPart = enc.encode(
        '--' + boundary + '\r\n' +
        'Content-Type: application/json; charset=UTF-8\r\n\r\n' +
        metadata + '\r\n' +
        '--' + boundary + '\r\n' +
        'Content-Type: ' + mimeType + '\r\n\r\n'
    );
    const closePart = enc.encode('\r\n--' + boundary + '--');

    // Send a Blob so the browser streams the multipart body — copying the clip
    // into a concatenated Uint8Array doubled its footprint in the JS heap.
    const body = new Blob([headerPart, blob, closePart]);

    return new Promise((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open('POST', 'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,webViewLink');
        xhr.setRequestHeader('Authorization', 'Bearer ' + driveAccessToken);
        xhr.setRequestHeader('Content-Type', 'multipart/related; boundary="' + boundary + '"');

        xhr.upload.addEventListener('progress', e => {
            if (e.lengthComputable && onProgress) {
                onProgress(Math.round(e.loaded / e.total * 100));
            }
        });

        xhr.onload = () => {
            if (xhr.status === 200 || xhr.status === 201) {
                resolve(JSON.parse(xhr.responseText));
            } else if (xhr.status === 401) {
                driveAccessToken = null;
                driveTokenExpiry = 0;
                reject(new Error('auth_expired'));
            } else {
                let reason = '';
                try {
                    const errData = JSON.parse(xhr.responseText);
                    reason = errData.error?.errors?.[0]?.reason || errData.error?.message || '';
                } catch (e) {}
                if (reason === 'storageQuotaExceeded') {
                    reject(new Error('Your Google Drive storage is full.'));
                } else {
                    reject(new Error('Upload failed (' + xhr.status + ')' + (reason ? ': ' + reason : '')));
                }
            }
        };

        xhr.onerror = () => reject(new Error('Network error during upload.'));
        xhr.send(body);
    });
}

async function saveToDrive(blob, filename, statusEl) {
    if (!currentUser) {
        showStatus('Sign in to save to Google Drive.', 'error');
        return;
    }
    if (!driveTokenClient) {
        showStatus('Google Drive is not available — try refreshing the page.', 'error');
        return;
    }

    statusEl.innerHTML = 'Connecting to Drive\u2026';
    statusEl.className = 'drive-status drive-status-loading';
    statusEl.style.display = '';

    const doUpload = async () => {
        try {
            const progressId = 'dp_' + Date.now();
            statusEl.innerHTML =
                '<span>Uploading\u2026</span>' +
                '<div class="drive-progress"><div class="drive-progress-fill" id="' + progressId + '"></div></div>' +
                '<span id="' + progressId + '_pct">0%</span>';
            statusEl.className = 'drive-status drive-status-loading';

            const result = await uploadToDrive(blob, filename, pct => {
                const fill = document.getElementById(progressId);
                const pctEl = document.getElementById(progressId + '_pct');
                if (fill) fill.style.width = pct + '%';
                if (pctEl) pctEl.textContent = pct + '%';
            });

            statusEl.innerHTML =
                'Saved! <a class="drive-link" href="' + result.webViewLink + '" target="_blank" rel="noopener">Open in Drive</a>';
            statusEl.className = 'drive-status drive-status-success';
        } catch (err) {
            if (err.message === 'auth_expired') {
                // Token expired mid-upload — refresh silently and retry once
                pendingDriveCallback = doUpload;
                driveTokenClient.requestAccessToken({ prompt: '' });
            } else {
                statusEl.innerHTML = 'Upload failed: ' + err.message;
                statusEl.className = 'drive-status drive-status-error';
            }
        }
    };

    requestDriveToken(doUpload);
}

// Called by export.js after each local download — surfaces a Drive upload button
// without re-running FFmpeg. The blob is captured in a closure per call.
function offerDriveUpload(blob, filename, statusId) {
    if (!currentUser) return;
    const el = document.getElementById(statusId);
    if (!el) return;
    el.className = 'drive-status drive-status-offer';
    el.style.display = '';
    el.innerHTML = '';
    const btn = document.createElement('button');
    btn.className = 'drive-btn';
    btn.textContent = '\u2601 Save to Drive';
    btn.addEventListener('click', () => saveToDrive(blob, filename, el));
    el.appendChild(btn);
}

// Called from the per-clip Drive button in the highlight list.
// Runs FFmpeg extraction (without watermark) then uploads directly to Drive.
async function triggerDriveForClip(index) {
    const statusEl = document.getElementById('drive-clip-status-' + index);
    if (!statusEl) return;
    statusEl.style.display = '';

    const highlight = highlights[index];
    if (!highlight) return;

    const loaded = await loadFFmpeg();
    if (!loaded) {
        statusEl.innerHTML = 'FFmpeg failed to load.';
        statusEl.className = 'drive-status drive-status-error';
        return;
    }

    statusEl.innerHTML = 'Exporting clip\u2026';
    statusEl.className = 'drive-status drive-status-loading';

    const blob = await extractClip(highlight);
    if (!blob) {
        statusEl.innerHTML = 'Clip export failed.';
        statusEl.className = 'drive-status drive-status-error';
        return;
    }

    const ext = guessVideoExtension();
    const filename = 'highlight-' + (index + 1) + '-' +
        formatTime(highlight.timestamp).replace(':', 'm').replace('.', 's') + '.' + ext;
    await saveToDrive(blob, filename, statusEl);
}

document.addEventListener('DOMContentLoaded', function () {
    if (typeof google !== 'undefined' && google.accounts && google.accounts.oauth2) {
        initDriveTokenClient();
    } else {
        const gsiScript = document.querySelector('script[src*="accounts.google.com/gsi/client"]');
        if (gsiScript) {
            gsiScript.addEventListener('load', initDriveTokenClient);
        }
    }
});

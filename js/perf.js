function resetPerfStats() {
    perfStats = {
        startTime: 0,
        frameCount: 0,
        seekTimes: [],       // all seek durations in ms
        seekTimeouts: 0,     // seeks that hit the 5s timeout
        drawTimes: [],       // drawImage + getImageData durations
        motionTimes: [],     // motion detection durations
        frameTimes: [],      // total per-frame durations
        lastSeeks: [],       // last 10 seek times for live view
    };
}

function updatePerfUI() {
    if (!perfStats || perfStats.frameCount === 0) return;
    const s = perfStats;
    const elapsed = (performance.now() - s.startTime) / 1000;
    const avg = arr => arr.length ? (arr.reduce((a, b) => a + b, 0) / arr.length) : 0;
    const min = arr => arr.length ? Math.min(...arr) : 0;
    const max = arr => arr.length ? Math.max(...arr) : 0;

    const seekAvg = avg(s.seekTimes);
    const seekMin = min(s.seekTimes);
    const seekMax = max(s.seekTimes);
    const slowSeeks = s.seekTimes.filter(t => t > 500).length;

    document.getElementById('perfFrameCount').textContent = s.frameCount;
    document.getElementById('perfElapsed').textContent = elapsed.toFixed(1) + 's';
    document.getElementById('perfFPS').textContent = (s.frameCount / elapsed).toFixed(2);

    const seekAvgEl = document.getElementById('perfSeekAvg');
    seekAvgEl.textContent = seekAvg.toFixed(1) + 'ms';
    seekAvgEl.className = 'perf-val' + (seekAvg > 500 ? ' bad' : seekAvg > 200 ? ' warn' : '');

    document.getElementById('perfSeekRange').textContent = seekMin.toFixed(0) + ' / ' + seekMax.toFixed(0) + 'ms';

    const toEl = document.getElementById('perfSeekTimeouts');
    toEl.textContent = s.seekTimeouts;
    toEl.className = 'perf-val' + (s.seekTimeouts > 0 ? ' bad' : '');

    const slowEl = document.getElementById('perfSlowSeeks');
    slowEl.textContent = slowSeeks;
    slowEl.className = 'perf-val' + (slowSeeks > 10 ? ' bad' : slowSeeks > 0 ? ' warn' : '');

    document.getElementById('perfDrawAvg').textContent = avg(s.drawTimes).toFixed(1) + 'ms';
    document.getElementById('perfMotionAvg').textContent = avg(s.motionTimes).toFixed(1) + 'ms';

    const frameAvgEl = document.getElementById('perfFrameAvg');
    const frameAvg = avg(s.frameTimes);
    frameAvgEl.textContent = frameAvg.toFixed(1) + 'ms';
    frameAvgEl.className = 'perf-val' + (frameAvg > 1000 ? ' bad' : frameAvg > 400 ? ' warn' : '');

    // Last 10 seeks with color coding
    const histEl = document.getElementById('perfSeekHistory');
    histEl.innerHTML = s.lastSeeks.map(t => {
        const color = t >= 4900 ? '#ff5252' : t > 500 ? '#ffd166' : '#64ffda';
        return `<span style="color:${color}">${t.toFixed(0)}</span>`;
    }).join(', ');
}

async function probeVideoInfo(video) {
    // Try to get codec info via VideoPlaybackQuality or MediaCapabilities
    const el = document.getElementById('perfResolution');
    el.textContent = video.videoWidth + 'x' + video.videoHeight;
    document.getElementById('perfDuration').textContent = video.duration.toFixed(1) + 's';

    // Try to detect codec from the source
    let codecInfo = 'unknown';
    try {
        // Use video.getVideoPlaybackQuality if available
        if (video.getVideoPlaybackQuality) {
            const q = video.getVideoPlaybackQuality();
            codecInfo = `dropped: ${q.droppedVideoFrames}/${q.totalVideoFrames}`;
        }
    } catch (e) {}

    // Try MediaSource.isTypeSupported to guess codec
    if (videoFile && videoFile.type) {
        codecInfo = videoFile.type;
    }
    document.getElementById('perfCodec').textContent = codecInfo;
}

// Ensure the video element is fully buffered and the decoder is warmed up.
// On mobile, the browser may have metadata but not the actual video data yet,
// causing extremely slow seeks during processing.
async function warmUpVideo(video, statusMsg) {
    // Step 1: Wait for enough data to play through
    if (video.readyState < 4) { // HAVE_ENOUGH_DATA
        showStatus(statusMsg + ' Buffering video...', 'processing');
        await new Promise((resolve) => {
            // Check if we already have enough data
            if (video.readyState >= 3) { resolve(); return; } // HAVE_FUTURE_DATA is acceptable
            const onReady = () => {
                if (video.readyState >= 3) {
                    video.removeEventListener('canplay', onReady);
                    video.removeEventListener('canplaythrough', onReady);
                    video.removeEventListener('loadeddata', onReady);
                    clearTimeout(fallback);
                    resolve();
                }
            };
            video.addEventListener('canplay', onReady);
            video.addEventListener('canplaythrough', onReady);
            video.addEventListener('loadeddata', onReady);
            // Don't wait forever — 10s max, then proceed anyway
            const fallback = setTimeout(() => {
                video.removeEventListener('canplay', onReady);
                video.removeEventListener('canplaythrough', onReady);
                video.removeEventListener('loadeddata', onReady);
                console.warn('[Perf] Video warmup timed out at readyState:', video.readyState);
                resolve();
            }, 10000);
        });
    }

    // Step 2: Prime the decoder by seeking to frame 0 and waiting for it to render.
    // This forces the browser to parse the keyframe index and decode the first frame.
    showStatus(statusMsg + ' Warming up decoder...', 'processing');
    video.currentTime = 0.001; // Tiny offset to force a real seek
    await new Promise((resolve) => {
        let resolved = false;
        const done = () => { if (!resolved) { resolved = true; resolve(); } };
        const timeout = setTimeout(done, 5000);
        video.addEventListener('seeked', () => { clearTimeout(timeout); done(); }, { once: true });
    });

    console.log('[Perf] Video warmed up. readyState:', video.readyState,
        'buffered ranges:', video.buffered.length > 0
            ? Array.from({length: video.buffered.length}, (_, i) =>
                `${video.buffered.start(i).toFixed(1)}-${video.buffered.end(i).toFixed(1)}s`).join(', ')
            : 'none');
}

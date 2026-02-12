async function processVideo() {
    if (basketRegions.length === 0) {
        showStatus('Please select at least one basket region before starting detection.', 'error');
        return;
    }

    const video = document.getElementById('processingVideo'); // Use hidden video
    const canvas = document.getElementById('canvas');
    const ctx = canvas.getContext('2d');

    canvas.width = 320;
    canvas.height = 180;

    highlights = [];
    chartData = [];
    chartDetections = [];

    // Update legend for number of regions
    const legendEl = document.getElementById('motionChartLegend');
    if (basketRegions.length >= 2) {
        legendEl.innerHTML =
            '<span><span class="dot" style="background: #4fc3f7;"></span> Basket 1</span>' +
            '<span><span class="dot" style="background: #ce93d8;"></span> Basket 2</span>' +
            '<span><span class="dot" style="background: rgba(255,82,82,0.6);"></span> Threshold</span>' +
            '<span><span class="dot" style="background: #4CAF50;"></span> Detection</span>';
    } else {
        legendEl.innerHTML =
            '<span><span class="dot" style="background: #4fc3f7;"></span> Motion</span>' +
            '<span><span class="dot" style="background: rgba(255,82,82,0.6);"></span> Threshold</span>' +
            '<span><span class="dot" style="background: #4CAF50;"></span> Detection</span>';
    }

    document.getElementById('processBtn').disabled = true;
    const nsp = document.getElementById('nextStepsPanel');
    if (nsp) nsp.style.display = 'none';
    document.getElementById('progressContainer').style.display = 'block';
    document.getElementById('highlightsSection').style.display = 'block';
    document.getElementById('motionChartContainer').style.display = 'block';

    const regionMsg = basketRegions.length > 0
        ? ` Detecting motion in ${basketRegions.length} region(s).`
        : ' Using full-frame motion detection.';
    showStatus('Processing video...' + regionMsg, 'processing');

    // Warm up the video decoder before processing — this ensures the browser
    // has fully buffered the video data and parsed the keyframe index.
    // Without this, mobile browsers often seek extremely slowly on first load
    // (black preview = data not ready), but fast on second load (cached).
    await warmUpVideo(video, 'Processing video...' + regionMsg);

    const duration = video.duration;
    const fps = 3;
    const interval = 1 / fps;

    let previousFrame = null;
    let framesProcessed = 0;
    const regionCount = Math.max(1, basketRegions.length);

    // Per-region motion histories
    let motionHistories = [];
    for (let i = 0; i < regionCount; i++) motionHistories.push([]);

    // Reset EMA state
    initRegionEMAs();

    // Performance diagnostics
    resetPerfStats();
    perfStats.startTime = performance.now();
    await probeVideoInfo(video);
    _processingAborted = false;

    for (let time = 0; time < duration; time += interval) {
        if (_processingAborted) return; // Abort if user triggered reload
        const frameStart = performance.now();

        // --- Timed seek ---
        const seekStart = performance.now();
        video.currentTime = time;

        let seekTimedOut = false;
        await new Promise(resolve => {
            let resolved = false;
            const done = (timedOut) => { if (!resolved) { resolved = true; if (timedOut) seekTimedOut = true; resolve(); } };
            const timeout = setTimeout(() => done(true), 5000);
            video.addEventListener('seeked', () => { clearTimeout(timeout); done(false); }, { once: true });
        });
        const seekMs = performance.now() - seekStart;
        perfStats.seekTimes.push(seekMs);
        if (seekTimedOut) perfStats.seekTimeouts++;
        perfStats.lastSeeks.push(seekMs);
        if (perfStats.lastSeeks.length > 10) perfStats.lastSeeks.shift();

        // --- Timed draw + getImageData ---
        const drawStart = performance.now();
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        let currentFrame;
        try {
            currentFrame = ctx.getImageData(0, 0, canvas.width, canvas.height);
        } catch (e) {
            // Tainted canvas — cross-origin video blocks pixel reading
            document.getElementById('processBtn').disabled = false;
            document.getElementById('progressContainer').style.display = 'none';
            showStatus('Cannot process this video due to cross-origin restrictions. The video server does not allow pixel-level access from the browser. Please download the video and upload it as a local file instead.', 'error');
            return;
        }
        perfStats.drawTimes.push(performance.now() - drawStart);

        if (previousFrame) {
            // --- Timed motion detection ---
            const motionStart = performance.now();
            const motions = detectMotion(previousFrame, currentFrame);
            perfStats.motionTimes.push(performance.now() - motionStart);

            // Push each region's motion into its own history
            motions.forEach((m, i) => {
                motionHistories[i].push(m);
                if (motionHistories[i].length > 15) motionHistories[i].shift();
            });

            // Record for chart: store per-region motions and thresholds
            const thresholds = motions.map((_, i) => getRegionThreshold(i));
            chartData.push({ time, motions, thresholds, detected: false });

            // Detect potential basket (need at least 4 frames per region)
            const minHistory = Math.min(...motionHistories.map(h => h.length));
            if (minHistory >= 4) {
                const detectionResult = calculateBasketScore(motionHistories, time);

                if (detectionResult.passes) {
                    const lastHighlight = highlights[highlights.length - 1];
                    if (!lastHighlight || time - lastHighlight.timestamp > settings.minGap) {
                        // Mark on chart
                        chartDetections.push(time);
                        if (chartData.length > 0) chartData[chartData.length - 1].detected = true;

                        // Capture thumbnail with detection data
                        const thumbnail = captureThumbnail(video, canvas, ctx, {
                            motion: detectionResult.motion,
                            rim: detectionResult.rim,
                            ball: detectionResult.ball,
                            score: detectionResult.score,
                            regionIndex: detectionResult.regionIndex
                        });

                        highlights.push({
                            timestamp: time,
                            confidence: Math.min(100, detectionResult.score),
                            thumbnail: thumbnail,
                            enabled: true,
                            reasons: detectionResult.reasons,
                            debugData: {
                                motion: detectionResult.motion,
                                rim: detectionResult.rim,
                                ball: detectionResult.ball,
                                motionDrop: detectionResult.motionDrop,
                                rimVisible: detectionResult.rimVisible,
                                ballPresent: detectionResult.ballPresent
                            }
                        });

                        // Update UI in real-time
                        updateHighlightsDisplay();
                        document.getElementById('basketsFound').textContent = highlights.length;

                        // Start playing clips as soon as we get the first one
                        if (highlights.length === 1 && !isPlayingAll) {
                            // Hide the setup guide
                            document.getElementById('setupGuide').style.display = 'none';

                            // Start playing immediately
                            setTimeout(() => {
                                playAllHighlights();
                            }, 500); // Small delay to let UI update
                        }
                    }
                }
            }
        }

        previousFrame = currentFrame;
        framesProcessed++;
        perfStats.frameCount = framesProcessed;
        perfStats.frameTimes.push(performance.now() - frameStart);

        const progress = Math.floor((time / duration) * 100);
        document.getElementById('progressFill').style.width = progress + '%';
        document.getElementById('progressText').textContent = progress + '%';
        document.getElementById('framesAnalyzed').textContent = framesProcessed;
        document.getElementById('currentProcessTime').textContent = formatTime(time);

        // Slow-processing detection: after 2 frames, check if we're crawling
        if (framesProcessed === 2 && !document.getElementById('slowBanner')) {
            const avgFrame = perfStats.frameTimes.reduce((a, b) => a + b, 0) / perfStats.frameTimes.length;
            if (avgFrame > 1500) {
                if (_slowRetryCount < _MAX_AUTO_RETRIES) {
                    // Auto-reload silently for the first 3 attempts
                    console.log(`[Perf] Slow processing detected (avg ${(avgFrame / 1000).toFixed(1)}s/frame). Auto-reloading (attempt ${_slowRetryCount + 1}/${_MAX_AUTO_RETRIES})...`);
                    reloadAndRetry();
                    return; // exit processVideo — reloadAndRetry will restart it
                } else {
                    // 4th time still slow — show manual button
                    const totalFrames = Math.ceil(duration / interval);
                    const estMinutes = ((totalFrames * avgFrame) / 60000).toFixed(0);
                    const banner = document.createElement('div');
                    banner.id = 'slowBanner';
                    banner.className = 'slow-processing-banner';
                    banner.innerHTML = `
                        <p><strong>Slow processing detected</strong><br>
                        Avg ${(avgFrame / 1000).toFixed(1)}s per frame — at this rate it would take ~${estMinutes} min.<br>
                        Auto-reload didn't help after ${_MAX_AUTO_RETRIES} attempts. You can try once more or wait it out.</p>
                        <button onclick="reloadAndRetry()">Reload Video & Retry</button>
                    `;
                    document.getElementById('progressContainer').appendChild(banner);
                }
            } else if (_slowRetryCount > 0) {
                // Was slow before but now it's fast — the reload worked!
                console.log(`[Perf] Processing speed OK after ${_slowRetryCount} reload(s) (avg ${avgFrame.toFixed(0)}ms/frame).`);
            }
        }

        // Allow UI to update and redraw chart every 15 frames
        if (framesProcessed % 15 === 0) {
            drawMotionChart();
            updatePerfUI();
            await new Promise(resolve => setTimeout(resolve, 0));
        }
    }

    // Final perf update & console summary
    updatePerfUI();
    if (perfStats) {
        const s = perfStats;
        const elapsed = ((performance.now() - s.startTime) / 1000).toFixed(1);
        const avg = arr => arr.length ? (arr.reduce((a, b) => a + b, 0) / arr.length).toFixed(1) : '—';
        console.log(`%c[Perf Summary]`, 'color: #64ffda; font-weight: bold;',
            `\n  Frames: ${s.frameCount} in ${elapsed}s (${(s.frameCount / elapsed).toFixed(2)} eff. FPS)` +
            `\n  Seek — avg: ${avg(s.seekTimes)}ms, min: ${Math.min(...s.seekTimes).toFixed(0)}ms, max: ${Math.max(...s.seekTimes).toFixed(0)}ms` +
            `\n  Seek timeouts: ${s.seekTimeouts}, slow (>500ms): ${s.seekTimes.filter(t => t > 500).length}` +
            `\n  Draw+read avg: ${avg(s.drawTimes)}ms, Motion calc avg: ${avg(s.motionTimes)}ms` +
            `\n  Total/frame avg: ${avg(s.frameTimes)}ms` +
            `\n  Codec: ${document.getElementById('perfCodec').textContent}` +
            `\n  Resolution: ${document.getElementById('perfResolution').textContent}`
        );
    }

    document.getElementById('processBtn').disabled = false;
    document.getElementById('progressContainer').style.display = 'none';
    document.getElementById('setupGuide').style.display = 'none';
    drawMotionChart();

    video.currentTime = 0;
    updateHighlightsDisplay();

    // Only auto-start if not already playing (might have started on first clip)
    if (highlights.length > 0 && !isPlayingAll) {
        showStatus(`Processing complete! Found ${highlights.length} clip(s). Playing now...`, 'complete');
        setTimeout(() => {
            playAllHighlights();
        }, 1000);
    } else if (isPlayingAll) {
        showStatus(`Processing complete! Found ${highlights.length} clip(s) total.`, 'complete');
    } else {
        showStatus(`Processing complete! No clips detected.`, 'complete');
    }
}

async function processVideo() {
    if (basketRegions.length === 0) {
        showStatus('Please select at least one basket region before starting detection.', 'error');
        return;
    }

    const video = document.getElementById('processingVideo'); // Use hidden video
    const canvas = document.getElementById('canvas');
    // willReadFrequently keeps the canvas CPU-backed — getImageData runs every
    // frame, and GPU-backed readback is a major stall on mobile browsers.
    const ctx = canvas.getContext('2d', { willReadFrequently: true });

    const quality = initialProcessingQuality();
    canvas.width = quality.width;
    canvas.height = quality.height;

    revokeHighlightThumbnails();
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
    const fps = quality.fps;
    const interval = 1 / fps;
    const maxHistory = fps * 5; // motion-history window ≈ 5 seconds of frames

    let previousFrame = null; // reused {data, width, height} snapshot buffer
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

    let lastYieldAt = performance.now();
    let lastChartDrawAt = 0;

    for (let time = 0; time < duration; time += interval) {
        if (_processingAborted) {
            // reloadAndRetry() manages its own UI and restart; only a user
            // cancel needs the UI restored here.
            if (_userCancelled) {
                _userCancelled = false;
                document.getElementById('processBtn').disabled = false;
                document.getElementById('progressContainer').style.display = 'none';
                showStatus('Processing cancelled.', 'complete');
            }
            return;
        }

        // Pause while the tab is hidden; exempt the pause from perf timing
        // and drop the previous frame (the decoder may have been evicted).
        if (document.hidden) {
            const pausedMs = await waitUntilVisible();
            perfStats.startTime += pausedMs;
            previousFrame = null;
        }

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
        recordPerfSample(perfStats.seek, seekMs);
        if (seekMs > 500) perfStats.slowSeekCount++;
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
        recordPerfSample(perfStats.draw, performance.now() - drawStart);

        if (previousFrame) {
            // --- Timed motion detection ---
            const motionStart = performance.now();
            const motions = detectMotion(previousFrame, currentFrame);
            recordPerfSample(perfStats.motion, performance.now() - motionStart);

            // Push each region's motion into its own history
            motions.forEach((m, i) => {
                motionHistories[i].push(m);
                if (motionHistories[i].length > maxHistory) motionHistories[i].shift();
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

                        // Capture thumbnail (async JPEG blob encode)
                        const thumbnail = await captureThumbnail(video);

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

        // Snapshot the current frame into one reused buffer instead of
        // retaining each frame's ImageData — steadier GC on long videos.
        if (!previousFrame || previousFrame.data.length !== currentFrame.data.length) {
            previousFrame = {
                data: new Uint8ClampedArray(currentFrame.data.length),
                width: currentFrame.width,
                height: currentFrame.height
            };
        }
        previousFrame.data.set(currentFrame.data);
        framesProcessed++;
        perfStats.frameCount = framesProcessed;
        recordPerfSample(perfStats.frame, performance.now() - frameStart);

        const progress = Math.floor((time / duration) * 100);
        document.getElementById('progressFill').style.width = progress + '%';
        document.getElementById('progressText').textContent = progress + '%';
        document.getElementById('framesAnalyzed').textContent = framesProcessed;
        document.getElementById('currentProcessTime').textContent = formatTime(time);

        // Slow-processing detection: after 2 frames, check if we're crawling.
        // Returns true when an auto-reload was triggered — reloadAndRetry
        // restarts processVideo, so this run must exit.
        if (framesProcessed === 2 && checkSlowProcessing(duration, interval)) {
            return;
        }

        // If the first frames show the device is crawling, halve the pixel
        // work for the rest of the run (resolution only — fps is fixed at
        // start so the motion-history window stays consistent).
        if (framesProcessed === 10 && maybeReduceQuality(canvas, perfAvg(perfStats.frame))) {
            previousFrame = null; // old resolution — diff would be invalid
        }

        // Yield to the UI on a time budget (rather than every N frames, which
        // could block for seconds worth of frames on a fast device), and
        // redraw the chart at most once per second.
        const now = performance.now();
        if (now - lastChartDrawAt > 1000) {
            drawMotionChart();
            updatePerfUI();
            lastChartDrawAt = now;
        }
        if (now - lastYieldAt > 150) {
            await new Promise(resolve => setTimeout(resolve, 0));
            lastYieldAt = performance.now();
        }
    }

    // Final perf update & console summary
    updatePerfUI();
    if (perfStats) {
        const s = perfStats;
        const elapsed = ((performance.now() - s.startTime) / 1000).toFixed(1);
        const avg = agg => agg.count ? perfAvg(agg).toFixed(1) : '—';
        console.log(`%c[Perf Summary]`, 'color: #64ffda; font-weight: bold;',
            `\n  Frames: ${s.frameCount} in ${elapsed}s (${(s.frameCount / elapsed).toFixed(2)} eff. FPS)` +
            `\n  Seek — avg: ${avg(s.seek)}ms, min: ${perfMin(s.seek).toFixed(0)}ms, max: ${s.seek.max.toFixed(0)}ms` +
            `\n  Seek timeouts: ${s.seekTimeouts}, slow (>500ms): ${s.slowSeekCount}` +
            `\n  Draw+read avg: ${avg(s.draw)}ms, Motion calc avg: ${avg(s.motion)}ms` +
            `\n  Total/frame avg: ${avg(s.frame)}ms` +
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

    // Prompt the user to download or share their reel (2s delay lets auto-play begin first)
    if (highlights.length > 0) {
        setTimeout(showPostDetectionModal, 2000);
    }
}

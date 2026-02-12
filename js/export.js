async function exportSingleClip(index) {
    const highlight = highlights[index];

    const loaded = await loadFFmpeg();
    if (!loaded) return;

    // Warn on very large videos (>500 MB)
    const fileSizeMB = videoFile ? videoFile.size / (1024 * 1024) : 0;
    if (fileSizeMB > 500) {
        showStatus('Large video — export may be slow. If the page reloads, try a shorter video.', 'processing');
    }

    const blob = await extractClip(highlight);
    if (!blob) return;

    const ext = guessVideoExtension();
    const filename = `highlight-${index + 1}-${formatTime(highlight.timestamp).replace(':', 'm').replace('.', 's')}.${ext}`;

    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);

    showStatus(`Clip ${index + 1} exported!`, 'complete');
}

async function exportClip() {
    const enabled = getEnabledHighlights();
    if (enabled.length === 0) {
        showStatus('No enabled highlights to export.', 'error');
        return;
    }

    const loaded = await loadFFmpeg();
    if (!loaded) return;

    // Check file size and warn on very large videos (>500 MB)
    const fileSizeMB = videoFile ? videoFile.size / (1024 * 1024) : 0;
    if (fileSizeMB > 500) {
        showStatus('Large video — export may be slow. If the page reloads, try a shorter video.', 'processing');
    }

    const ext = guessVideoExtension();

    const overlay = document.getElementById('ffmpegLoading');
    const titleEl = document.getElementById('ffmpegLoadingTitle');
    const textEl = document.getElementById('ffmpegLoadingText');
    const progressEl = document.getElementById('ffmpegProgressFill');
    overlay.classList.add('active');
    titleEl.textContent = 'Exporting Highlights...';
    progressEl.style.width = '5%';

    // Sort highlights by timestamp so the stitched video is in order
    const sorted = [...enabled].sort((a, b) => a.timestamp - b.timestamp);

    try {
        // ── Phase 1: Extract each segment one at a time ──
        // For each clip we: read video → write to MEMFS → extract segment
        // → read segment back to JS → wipe MEMFS.  This keeps peak WASM
        // memory at ~1× video size instead of video + all segments.
        const segmentBuffers = []; // small Uint8Arrays (~4 s each)
        const inputName = `input.${ext}`;

        for (let i = 0; i < sorted.length; i++) {
            const h = sorted[i];
            const segName = `seg.${ext}`;
            const startTime = Math.max(0, h.timestamp - 3);
            const duration = 4;

            textEl.textContent = `Reading video for clip ${i + 1}...`;
            let data = await getVideoData();
            if (!data) throw new Error('Could not read video data');

            await ffmpegInstance.writeFile(inputName, new Uint8Array(data));
            data = null; // allow GC of the JS-heap copy

            textEl.textContent = `Trimming clip ${i + 1} of ${sorted.length}...`;
            await ffmpegInstance.exec([
                '-ss', startTime.toFixed(2),
                '-i', inputName,
                '-t', duration.toFixed(2),
                '-c', 'copy',
                '-avoid_negative_ts', 'make_zero',
                segName
            ]);

            // Read the small segment into JS, then wipe MEMFS completely
            const segData = await ffmpegInstance.readFile(segName);
            await ffmpegInstance.deleteFile(inputName).catch(() => {});
            await ffmpegInstance.deleteFile(segName).catch(() => {});

            segmentBuffers.push(segData);
            progressEl.style.width = (5 + 60 * (i + 1) / sorted.length) + '%';
        }

        // ── Phase 2: Concatenate the small segments ──
        // MEMFS is empty here; we only write back the tiny clips.
        let outputBlob;
        const mimeType = ext === 'webm' ? 'video/webm' : 'video/mp4';

        if (segmentBuffers.length === 1) {
            outputBlob = new Blob([segmentBuffers[0].buffer], { type: mimeType });
        } else {
            textEl.textContent = 'Stitching clips together...';
            const segmentNames = [];
            for (let i = 0; i < segmentBuffers.length; i++) {
                const name = `seg${i}.${ext}`;
                await ffmpegInstance.writeFile(name, segmentBuffers[i]);
                segmentNames.push(name);
            }
            segmentBuffers.length = 0; // free JS copies

            const concatList = segmentNames.map(s => `file '${s}'`).join('\n');
            await ffmpegInstance.writeFile('concat.txt', new TextEncoder().encode(concatList));

            const outputName = `output.${ext}`;
            await ffmpegInstance.exec([
                '-f', 'concat',
                '-safe', '0',
                '-i', 'concat.txt',
                '-c', 'copy',
                outputName
            ]);

            // Cleanup segments + concat list
            await ffmpegInstance.deleteFile('concat.txt').catch(() => {});
            for (const s of segmentNames) await ffmpegInstance.deleteFile(s).catch(() => {});

            const outputData = await ffmpegInstance.readFile(outputName);
            await ffmpegInstance.deleteFile(outputName).catch(() => {});

            outputBlob = new Blob([outputData.buffer], { type: mimeType });
        }
        progressEl.style.width = '80%';

        // ── Phase 3: Overlay timeline bar + clip counters onto the video ──
        if (sorted.length > 1) {
            const counterFiles = [];
            try {
                textEl.textContent = 'Adding overlays...';
                const video = document.getElementById('videoPlayer');
                const vw = video.videoWidth || 1280;
                const vh = video.videoHeight || 720;

                const clipDuration = 4;

                // Generate counter PNGs for each clip
                for (let i = 0; i < sorted.length; i++) {
                    const counterPNG = generateCounterPNG(i + 1, sorted.length, vw, vh);
                    const name = `counter_${i}.png`;
                    await ffmpegInstance.writeFile(name, counterPNG);
                    counterFiles.push(name);
                }

                const tmpInput = `tmp_in.${ext}`;
                const tmpInputData = new Uint8Array(await outputBlob.arrayBuffer());
                await ffmpegInstance.writeFile(tmpInput, tmpInputData);

                // Build input args: video (0), counter_0 (1), counter_1 (2), ...
                const inputArgs = ['-i', tmpInput];
                for (const cf of counterFiles) {
                    inputArgs.push('-i', cf);
                }

                // Build filter_complex chain for counter overlays
                const margin = Math.round(vw * 0.02);
                let filter = '';

                for (let i = 0; i < sorted.length; i++) {
                    const inputIdx = i + 1; // counter inputs start at index 1
                    const tStart = (i * clipDuration).toFixed(2);
                    const tEnd = ((i + 1) * clipDuration).toFixed(2);
                    const prevLabel = i === 0 ? '0:v' : `s${i - 1}`;
                    const isLast = i === sorted.length - 1;

                    if (i > 0) filter += ';';

                    if (isLast) {
                        filter += `[${inputIdx}:v]format=rgba[c${i}];[${prevLabel}][c${i}]overlay=${margin}:${margin}:enable='between(t,${tStart},${tEnd})'`;
                    } else {
                        filter += `[${inputIdx}:v]format=rgba[c${i}];[${prevLabel}][c${i}]overlay=${margin}:${margin}:enable='between(t,${tStart},${tEnd})'[s${i}]`;
                    }
                }

                const finalName = 'final.mp4';
                await ffmpegInstance.exec([
                    ...inputArgs,
                    '-filter_complex', filter,
                    '-c:v', 'libx264',
                    '-preset', 'ultrafast',
                    '-crf', '23',
                    '-c:a', 'copy',
                    '-movflags', '+faststart',
                    '-y',
                    finalName
                ]);

                const finalData = await ffmpegInstance.readFile(finalName);
                await ffmpegInstance.deleteFile(tmpInput).catch(() => {});
                for (const cf of counterFiles) await ffmpegInstance.deleteFile(cf).catch(() => {});
                await ffmpegInstance.deleteFile(finalName).catch(() => {});

                outputBlob = new Blob([finalData.buffer], { type: 'video/mp4' });
            } catch (tlErr) {
                console.warn('Overlay failed, exporting without it:', tlErr);
                // Clean up counter files on error
                for (const cf of counterFiles) await ffmpegInstance.deleteFile(cf).catch(() => {});
                // Continue with the original outputBlob (no overlays)
            }
        }

        progressEl.style.width = '95%';
        overlay.classList.remove('active');

        const dlExt = sorted.length > 1 ? 'mp4' : ext;
        const url = URL.createObjectURL(outputBlob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `highlights.${dlExt}`;
        a.click();
        URL.revokeObjectURL(url);

        showStatus(`${enabled.length} clip(s) stitched and exported!`, 'complete');
    } catch (err) {
        console.error('Export error:', err);
        overlay.classList.remove('active');
        // Best-effort MEMFS cleanup on failure
        const filesToClean = [`input.${ext}`, `output.${ext}`, `seg.${ext}`, 'concat.txt', `tmp_in.${ext}`, 'timeline.png', 'final.mp4'];
        for (let i = 0; i < enabled.length; i++) {
            filesToClean.push(`seg${i}.${ext}`, `counter_${i}.png`);
        }
        for (const f of filesToClean) await ffmpegInstance.deleteFile(f).catch(() => {});
        showStatus('Failed to export clips. The video may be too large for your browser — try fewer clips or a shorter video.', 'error');
    }
}

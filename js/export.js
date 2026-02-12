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

        // ── Phase 3: Overlay timeline bar onto the video ──
        if (sorted.length > 1) {
            try {
                textEl.textContent = 'Adding timeline overlay...';
                const video = document.getElementById('videoPlayer');
                const vw = video.videoWidth || 1280;
                const vh = video.videoHeight || 720;

                const clipDurations = sorted.map(() => 4);
                const timelinePNG = generateTimelinePNG(sorted.length, clipDurations, vw, vh);
                await ffmpegInstance.writeFile('timeline.png', timelinePNG);

                const tmpInput = `tmp_in.${ext}`;
                const tmpInputData = new Uint8Array(await outputBlob.arrayBuffer());
                await ffmpegInstance.writeFile(tmpInput, tmpInputData);

                const finalName = 'final.mp4';
                await ffmpegInstance.exec([
                    '-i', tmpInput,
                    '-i', 'timeline.png',
                    '-filter_complex',
                    '[1:v]format=rgba[ovr];[0:v][ovr]overlay=0:main_h-overlay_h',
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
                await ffmpegInstance.deleteFile('timeline.png').catch(() => {});
                await ffmpegInstance.deleteFile(finalName).catch(() => {});

                outputBlob = new Blob([finalData.buffer], { type: 'video/mp4' });
            } catch (tlErr) {
                console.warn('Timeline overlay failed, exporting without it:', tlErr);
                // Continue with the original outputBlob (no timeline)
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
        for (let i = 0; i < enabled.length; i++) filesToClean.push(`seg${i}.${ext}`);
        for (const f of filesToClean) await ffmpegInstance.deleteFile(f).catch(() => {});
        showStatus('Failed to export clips. The video may be too large for your browser — try fewer clips or a shorter video.', 'error');
    }
}

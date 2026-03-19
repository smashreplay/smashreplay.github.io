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

    // Apply watermark via a second FFmpeg pass
    const wmOverlay = document.getElementById('ffmpegLoading');
    const wmTitleEl = document.getElementById('ffmpegLoadingTitle');
    const wmTextEl = document.getElementById('ffmpegLoadingText');
    const wmProgressEl = document.getElementById('ffmpegProgressFill');
    wmOverlay.classList.add('active');
    wmTitleEl.textContent = 'Adding Watermark...';
    wmTextEl.textContent = 'Applying watermark...';
    wmProgressEl.style.width = '20%';

    let finalBlob = blob;
    try {
        const video = document.getElementById('videoPlayer');
        const vw = video.videoWidth || 1280;
        const vh = video.videoHeight || 720;

        const watermarkPNG = generateWatermarkPNG(vw, vh);
        await ffmpegInstance.writeFile('watermark.png', watermarkPNG);

        const dateStr = videoFile ? formatVideoDate(videoFile) : '';
        const datePNG = dateStr ? generateDatePNG(dateStr, vw, vh) : null;
        if (datePNG) await ffmpegInstance.writeFile('datestamp.png', datePNG);

        const wmInputName = 'wm_in.mp4';
        const wmOutputName = 'wm_out.mp4';
        await ffmpegInstance.writeFile(wmInputName, new Uint8Array(await blob.arrayBuffer()));
        wmProgressEl.style.width = '50%';

        const singleInputArgs = ['-i', wmInputName, '-i', 'watermark.png'];
        if (datePNG) singleInputArgs.push('-i', 'datestamp.png');
        const singleFilter = datePNG
            ? '[1:v]format=rgba[wm];[2:v]format=rgba[dt];[0:v][wm]overlay=W-w-16:H-h-16[tmp];[tmp][dt]overlay=W-w-16:16'
            : '[1:v]format=rgba[wm];[0:v][wm]overlay=W-w-16:H-h-16';

        await ffmpegInstance.exec([
            ...singleInputArgs,
            '-filter_complex', singleFilter,
            '-c:v', 'libx264',
            '-preset', 'ultrafast',
            '-crf', '23',
            '-c:a', 'copy',
            '-movflags', '+faststart',
            '-y',
            wmOutputName
        ]);
        wmProgressEl.style.width = '90%';

        const outputData = await ffmpegInstance.readFile(wmOutputName);
        await ffmpegInstance.deleteFile(wmInputName).catch(() => {});
        await ffmpegInstance.deleteFile(wmOutputName).catch(() => {});
        await ffmpegInstance.deleteFile('watermark.png').catch(() => {});
        await ffmpegInstance.deleteFile('datestamp.png').catch(() => {});

        finalBlob = new Blob([outputData.buffer], { type: 'video/mp4' });
        wmOverlay.classList.remove('active');
    } catch (wmErr) {
        console.warn('Watermark pass failed, exporting without it:', wmErr);
        await ffmpegInstance.deleteFile('watermark.png').catch(() => {});
        await ffmpegInstance.deleteFile('datestamp.png').catch(() => {});
        await ffmpegInstance.deleteFile('wm_in.mp4').catch(() => {});
        await ffmpegInstance.deleteFile('wm_out.mp4').catch(() => {});
        wmOverlay.classList.remove('active');
    }

    const ext = guessVideoExtension();
    const dlExt = finalBlob.type === 'video/mp4' ? 'mp4' : ext;
    const filename = `highlight-${index + 1}-${formatTime(highlight.timestamp).replace(':', 'm').replace('.', 's')}.${dlExt}`;

    const url = URL.createObjectURL(finalBlob);
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

    // Split into batches of 5 to prevent RAM crashes on mobile
    const BATCH_SIZE = 5;
    const batches = [];
    for (let i = 0; i < sorted.length; i += BATCH_SIZE) {
        batches.push(sorted.slice(i, i + BATCH_SIZE));
    }
    const totalBatches = batches.length;

    try {
        for (let batchIdx = 0; batchIdx < totalBatches; batchIdx++) {
            const batch = batches[batchIdx];
            const batchLabel = totalBatches > 1 ? ` (batch ${batchIdx + 1} of ${totalBatches})` : '';

            if (totalBatches > 1) {
                titleEl.textContent = `Exporting Batch ${batchIdx + 1} of ${totalBatches}...`;
            }

        // ── Phase 1: Extract each segment one at a time ──
        // For each clip we: read video → write to MEMFS → extract segment
        // → read segment back to JS → wipe MEMFS.  This keeps peak WASM
        // memory at ~1× video size instead of video + all segments.
        const segmentBuffers = []; // small Uint8Arrays (~4 s each)
        const inputName = `input.${ext}`;

            for (let i = 0; i < batch.length; i++) {
                const h = batch[i];
            const segName = `seg.${ext}`;
            const startTime = Math.max(0, h.timestamp - 3);
            const duration = 5;

                textEl.textContent = `Reading video for clip ${i + 1}${batchLabel}...`;
            let data = await getVideoData();
            if (!data) throw new Error('Could not read video data');

            await ffmpegInstance.writeFile(inputName, new Uint8Array(data));
            data = null; // allow GC of the JS-heap copy

                textEl.textContent = `Trimming clip ${i + 1} of ${batch.length}${batchLabel}...`;
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
                const batchProgress = batchIdx / totalBatches;
                const batchShare = 1 / totalBatches;
                progressEl.style.width = (5 + 60 * (batchProgress + batchShare * (i + 1) / batch.length)) + '%';
        }

        // ── Phase 2: Concatenate the small segments ──
        // MEMFS is empty here; we only write back the tiny clips.
        let outputBlob;
        const mimeType = ext === 'webm' ? 'video/webm' : 'video/mp4';

        if (segmentBuffers.length === 1) {
            outputBlob = new Blob([segmentBuffers[0].buffer], { type: mimeType });
        } else {
                textEl.textContent = `Stitching clips together${batchLabel}...`;
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
            progressEl.style.width = (5 + 60 * (batchIdx + 1) / totalBatches + 20) + '%';

        // ── Phase 3: Overlay watermark (+ clip counters for multi-clip) ──
        {
            const counterFiles = [];
            try {
                    textEl.textContent = `Adding overlays${batchLabel}...`;
                const video = document.getElementById('videoPlayer');
                const vw = video.videoWidth || 1280;
                const vh = video.videoHeight || 720;

                // Generate and write watermark PNG
                const watermarkPNG = generateWatermarkPNG(vw, vh);
                await ffmpegInstance.writeFile('watermark.png', watermarkPNG);

                const dateStr = videoFile ? formatVideoDate(videoFile) : '';
                const datePNG = dateStr ? generateDatePNG(dateStr, vw, vh) : null;
                if (datePNG) await ffmpegInstance.writeFile('datestamp.png', datePNG);

                const tmpInput = `tmp_in.${ext}`;
                const tmpInputData = new Uint8Array(await outputBlob.arrayBuffer());
                await ffmpegInstance.writeFile(tmpInput, tmpInputData);

                // Build input args: video (0), [counters 1..N if multi-clip], watermark (last or last-1), datestamp (last if present)
                const inputArgs = ['-i', tmpInput];
                let filter = '';

                    if (batch.length > 1) {
                    const clipDuration = 4;
                    const margin = Math.round(vw * 0.02);

                    // Counter PNGs are inputs 1..N
                        for (let i = 0; i < batch.length; i++) {
                            const counterPNG = generateCounterPNG(i + 1, batch.length, vw, vh);
                        const name = `counter_${i}.png`;
                        await ffmpegInstance.writeFile(name, counterPNG);
                        counterFiles.push(name);
                        inputArgs.push('-i', name);
                    }

                    // Watermark is input at index batch.length + 1
                        inputArgs.push('-i', 'watermark.png');
                        const wmIdx = batch.length + 1;
                    // Datestamp is next input if present
                    if (datePNG) inputArgs.push('-i', 'datestamp.png');
                    const dtIdx = batch.length + 2;

                    // Counter overlays — each gets an output label for chaining
                        for (let i = 0; i < batch.length; i++) {
                        const inputIdx = i + 1;
                        const tStart = (i * clipDuration).toFixed(2);
                        const tEnd = ((i + 1) * clipDuration).toFixed(2);
                        const prevLabel = i === 0 ? '0:v' : `s${i - 1}`;

                        if (i > 0) filter += ';';
                        filter += `[${inputIdx}:v]format=rgba[c${i}];[${prevLabel}][c${i}]overlay=${margin}:${margin}:enable='between(t,${tStart},${tEnd})'[s${i}]`;
                    }

                    // Watermark overlay (bottom-right) on top of final counter output
                    if (datePNG) {
                        filter += `;[${wmIdx}:v]format=rgba[wm];[s${batch.length - 1}][wm]overlay=W-w-16:H-h-16[tmp_wm];[${dtIdx}:v]format=rgba[dt];[tmp_wm][dt]overlay=W-w-16:16`;
                    } else {
                        filter += `;[${wmIdx}:v]format=rgba[wm];[s${batch.length - 1}][wm]overlay=W-w-16:H-h-16`;
                    }
                } else {
                    // Single clip: watermark (input 1), datestamp (input 2 if present)
                    inputArgs.push('-i', 'watermark.png');
                    if (datePNG) inputArgs.push('-i', 'datestamp.png');
                    filter = datePNG
                        ? '[1:v]format=rgba[wm];[2:v]format=rgba[dt];[0:v][wm]overlay=W-w-16:H-h-16[tmp];[tmp][dt]overlay=W-w-16:16'
                        : '[1:v]format=rgba[wm];[0:v][wm]overlay=W-w-16:H-h-16';
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
                await ffmpegInstance.deleteFile('watermark.png').catch(() => {});
                await ffmpegInstance.deleteFile('datestamp.png').catch(() => {});
                for (const cf of counterFiles) await ffmpegInstance.deleteFile(cf).catch(() => {});
                await ffmpegInstance.deleteFile(finalName).catch(() => {});

                outputBlob = new Blob([finalData.buffer], { type: 'video/mp4' });
            } catch (tlErr) {
                console.warn('Overlay failed, exporting without it:', tlErr);
                await ffmpegInstance.deleteFile('watermark.png').catch(() => {});
                await ffmpegInstance.deleteFile('datestamp.png').catch(() => {});
                for (const cf of counterFiles) await ffmpegInstance.deleteFile(cf).catch(() => {});
                // Continue with the original outputBlob (no overlays)
            }
        }

            // ── Download this batch ──
            const filename = totalBatches > 1
                ? `highlights-batch-${batchIdx + 1}-of-${totalBatches}.mp4`
                : 'highlights.mp4';
        const url = URL.createObjectURL(outputBlob);
        const a = document.createElement('a');
        a.href = url;
            a.download = filename;
        a.click();
        URL.revokeObjectURL(url);

            if (totalBatches > 1) {
                showStatus(`Exported batch ${batchIdx + 1} of ${totalBatches} (${batch.length} clip${batch.length > 1 ? 's' : ''})`, 'processing');
                // Pause briefly to let the browser breathe before the next batch
                await new Promise(resolve => setTimeout(resolve, 500));
            }
        } // end batch loop

        progressEl.style.width = '95%';
        overlay.classList.remove('active');

        if (totalBatches > 1) {
            showStatus(`All ${totalBatches} batches exported (${enabled.length} clips total)!`, 'complete');
        } else {
            showStatus(`${enabled.length} clip(s) stitched and exported!`, 'complete');
        }
    } catch (err) {
        console.error('Export error:', err);
        overlay.classList.remove('active');
        // Best-effort MEMFS cleanup on failure
        const filesToClean = [`input.${ext}`, `output.${ext}`, `seg.${ext}`, 'concat.txt', `tmp_in.${ext}`, 'timeline.png', 'final.mp4', 'watermark.png', 'datestamp.png'];
        for (let i = 0; i < enabled.length; i++) {
            filesToClean.push(`seg${i}.${ext}`, `counter_${i}.png`);
        }
        for (const f of filesToClean) await ffmpegInstance.deleteFile(f).catch(() => {});
        showStatus('Failed to export clips. The video may be too large for your browser — try fewer clips or a shorter video.', 'error');
    }
}

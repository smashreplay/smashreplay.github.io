async function exportSingleClip(index) {
    const highlight = highlights[index];

    const loaded = await loadFFmpeg();
    if (!loaded) return;

    // Warn on very large videos (>500 MB)
    const fileSizeMB = videoFile ? videoFile.size / (1024 * 1024) : 0;
    if (fileSizeMB > 500) {
        showStatus('Large video — export may be slow. If the page reloads, try a shorter video.', 'processing');
    }

    try {
        const blob = await extractClip(highlight);
        if (!blob) return;

        // Apply watermark via a second FFmpeg pass (operates on the small clip)
        const finalBlob = await applyWatermarkPass(blob);

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
        offerDriveUpload(finalBlob, filename, 'drive-status-single');
    } finally {
        releaseFFmpeg();
    }
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

    let videoInput = null;
    try {
        // Mount (or, as a fallback, write) the source video ONCE for the whole
        // export. Previously the entire file was copied into MEMFS once per
        // clip — the dominant memory spike on phones.
        textEl.textContent = 'Preparing video...';
        videoInput = await mountVideoInput();
        if (!videoInput) throw new Error('Could not read video data');

        for (let batchIdx = 0; batchIdx < totalBatches; batchIdx++) {
            const batch = batches[batchIdx];
            const batchLabel = totalBatches > 1 ? ` (batch ${batchIdx + 1} of ${totalBatches})` : '';

            if (totalBatches > 1) {
                titleEl.textContent = `Exporting Batch ${batchIdx + 1} of ${totalBatches}...`;
            }

            // ── Phase 1: Extract each segment from the shared input ──
            const segmentBuffers = []; // small Uint8Arrays (~4 s each)

            for (let i = 0; i < batch.length; i++) {
                const h = batch[i];
                const segName = `seg.${ext}`;
                const startTime = Math.max(0, h.timestamp - 3);
                const duration = 5;

                textEl.textContent = `Trimming clip ${i + 1} of ${batch.length}${batchLabel}...`;
                await ffmpegInstance.exec([
                    '-ss', startTime.toFixed(2),
                    '-i', videoInput.path,
                    '-t', duration.toFixed(2),
                    '-c', 'copy',
                    '-avoid_negative_ts', 'make_zero',
                    segName
                ]);

                // Read the small segment into JS, drop it from MEMFS
                const segData = await ffmpegInstance.readFile(segName);
                await ffmpegInstance.deleteFile(segName).catch(() => {});

                segmentBuffers.push(segData);
                const batchProgress = batchIdx / totalBatches;
                const batchShare = 1 / totalBatches;
                progressEl.style.width = (5 + 60 * (batchProgress + batchShare * (i + 1) / batch.length)) + '%';
            }

            // ── Phase 2: Concatenate the small segments ──
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
            outputBlob = await applyBatchOverlayPass(outputBlob, batch.length, ext, textEl, batchLabel);

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
            offerDriveUpload(outputBlob, filename, 'drive-status-bulk');

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
        const filesToClean = [`output.${ext}`, `seg.${ext}`, 'concat.txt', `tmp_in.${ext}`, 'timeline.png', 'final.mp4', 'watermark.png', 'datestamp.png'];
        for (let i = 0; i < enabled.length; i++) {
            filesToClean.push(`seg${i}.${ext}`, `counter_${i}.png`);
        }
        if (ffmpegInstance) {
            for (const f of filesToClean) await ffmpegInstance.deleteFile(f).catch(() => {});
        }
        showStatus('Failed to export clips. The video may be too large for your browser — try fewer clips or a shorter video.', 'error');
    } finally {
        if (videoInput) await videoInput.cleanup();
        releaseFFmpeg();
    }
}

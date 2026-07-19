// ─── Export overlay passes ───
// Re-encodes a short (already-trimmed) clip with watermark, date stamp, and
// clip-counter overlays. Extracted from export.js. Both passes operate on
// clip-sized data only — never on the full source video — and fall back to
// returning the un-overlaid blob if anything fails.

// Single-clip watermark + date stamp pass.
async function applyWatermarkPass(blob) {
    const wmOverlay = document.getElementById('ffmpegLoading');
    const wmTitleEl = document.getElementById('ffmpegLoadingTitle');
    const wmTextEl = document.getElementById('ffmpegLoadingText');
    const wmProgressEl = document.getElementById('ffmpegProgressFill');
    wmOverlay.classList.add('active');
    wmTitleEl.textContent = 'Adding Watermark...';
    wmTextEl.textContent = 'Applying watermark...';
    wmProgressEl.style.width = '20%';

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

        wmOverlay.classList.remove('active');
        return new Blob([outputData.buffer], { type: 'video/mp4' });
    } catch (wmErr) {
        console.warn('Watermark pass failed, exporting without it:', wmErr);
        await ffmpegInstance.deleteFile('watermark.png').catch(() => {});
        await ffmpegInstance.deleteFile('datestamp.png').catch(() => {});
        await ffmpegInstance.deleteFile('wm_in.mp4').catch(() => {});
        await ffmpegInstance.deleteFile('wm_out.mp4').catch(() => {});
        wmOverlay.classList.remove('active');
        return blob;
    }
}

// Batch pass: watermark + date stamp, plus per-clip counters when the batch
// has more than one clip. Returns the overlaid blob, or the original on failure.
async function applyBatchOverlayPass(outputBlob, batchLength, ext, textEl, batchLabel) {
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

        if (batchLength > 1) {
            const clipDuration = 4;
            const margin = Math.round(vw * 0.02);

            // Counter PNGs are inputs 1..N
            for (let i = 0; i < batchLength; i++) {
                const counterPNG = generateCounterPNG(i + 1, batchLength, vw, vh);
                const name = `counter_${i}.png`;
                await ffmpegInstance.writeFile(name, counterPNG);
                counterFiles.push(name);
                inputArgs.push('-i', name);
            }

            // Watermark is input at index batchLength + 1
            inputArgs.push('-i', 'watermark.png');
            const wmIdx = batchLength + 1;
            // Datestamp is next input if present
            if (datePNG) inputArgs.push('-i', 'datestamp.png');
            const dtIdx = batchLength + 2;

            // Counter overlays — each gets an output label for chaining
            for (let i = 0; i < batchLength; i++) {
                const inputIdx = i + 1;
                const tStart = (i * clipDuration).toFixed(2);
                const tEnd = ((i + 1) * clipDuration).toFixed(2);
                const prevLabel = i === 0 ? '0:v' : `s${i - 1}`;

                if (i > 0) filter += ';';
                filter += `[${inputIdx}:v]format=rgba[c${i}];[${prevLabel}][c${i}]overlay=${margin}:${margin}:enable='between(t,${tStart},${tEnd})'[s${i}]`;
            }

            // Watermark overlay (bottom-right) on top of final counter output
            if (datePNG) {
                filter += `;[${wmIdx}:v]format=rgba[wm];[s${batchLength - 1}][wm]overlay=W-w-16:H-h-16[tmp_wm];[${dtIdx}:v]format=rgba[dt];[tmp_wm][dt]overlay=W-w-16:16`;
            } else {
                filter += `;[${wmIdx}:v]format=rgba[wm];[s${batchLength - 1}][wm]overlay=W-w-16:H-h-16`;
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

        return new Blob([finalData.buffer], { type: 'video/mp4' });
    } catch (tlErr) {
        console.warn('Overlay failed, exporting without it:', tlErr);
        await ffmpegInstance.deleteFile('watermark.png').catch(() => {});
        await ffmpegInstance.deleteFile('datestamp.png').catch(() => {});
        for (const cf of counterFiles) await ffmpegInstance.deleteFile(cf).catch(() => {});
        // Continue with the original outputBlob (no overlays)
        return outputBlob;
    }
}

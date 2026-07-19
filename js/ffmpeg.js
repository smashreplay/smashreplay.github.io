// ─── FFmpeg WASM Integration ───

// Custom toBlobURL — replaces @ffmpeg/util (whose 0.12.2 UMD build is broken)
async function toBlobURL(url, mimeType) {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`Fetch failed: ${url} (${response.status})`);
    const buf = await response.arrayBuffer();
    return URL.createObjectURL(new Blob([buf], { type: mimeType }));
}

// Blob URLs for the FFmpeg script/core/worker, fetched once and cached so
// releaseFFmpeg() + reload never re-downloads the ~30 MB core.
let _ffmpegAssets = null; // { coreURL, wasmURL, workerBlobURL }

async function fetchFFmpegAssets(textEl, progressEl) {
    if (_ffmpegAssets) return _ffmpegAssets;

    // Load only @ffmpeg/ffmpeg UMD script (global: FFmpegWASM)
    // Note: @ffmpeg/util@0.12.2 UMD is broken (gh #848), so we use our own toBlobURL
    await loadScript('https://cdn.jsdelivr.net/npm/@ffmpeg/ffmpeg@0.12.15/dist/umd/ffmpeg.js')
        .catch(() => loadScript('https://unpkg.com/@ffmpeg/ffmpeg@0.12.15/dist/umd/ffmpeg.js'));
    progressEl.style.width = '15%';
    textEl.textContent = 'Downloading FFmpeg core...';

    const coreBase = 'https://unpkg.com/@ffmpeg/core@0.12.10/dist/umd';
    const ffmpegBase = 'https://cdn.jsdelivr.net/npm/@ffmpeg/ffmpeg@0.12.15/dist/umd';

    // Convert all resources to same-origin blob URLs.
    // This is critical: Workers cannot be created from cross-origin URLs,
    // and the ffmpeg class internally spawns a Worker from 814.ffmpeg.js.
    const [coreURL, wasmURL, workerBlobURL] = await Promise.all([
        toBlobURL(`${coreBase}/ffmpeg-core.js`, 'text/javascript'),
        toBlobURL(`${coreBase}/ffmpeg-core.wasm`, 'application/wasm'),
        toBlobURL(`${ffmpegBase}/814.ffmpeg.js`, 'text/javascript'),
    ]);
    _ffmpegAssets = { coreURL, wasmURL, workerBlobURL };
    return _ffmpegAssets;
}

async function loadFFmpeg() {
    if (ffmpegLoaded) return true;
    if (ffmpegLoading) return false;
    ffmpegLoading = true;

    const overlay = document.getElementById('ffmpegLoading');
    const titleEl = document.getElementById('ffmpegLoadingTitle');
    const textEl = document.getElementById('ffmpegLoadingText');
    const progressEl = document.getElementById('ffmpegProgressFill');

    overlay.classList.add('active');
    titleEl.textContent = 'Loading Video Editor...';
    textEl.textContent = _ffmpegAssets
        ? 'Initializing FFmpeg...'
        : 'Downloading FFmpeg (~30 MB, first time only)';
    progressEl.style.width = '10%';

    try {
        const { coreURL, wasmURL, workerBlobURL } = await fetchFFmpegAssets(textEl, progressEl);
        progressEl.style.width = '80%';

        textEl.textContent = 'Initializing FFmpeg...';

        const { FFmpeg } = FFmpegWASM;
        ffmpegInstance = new FFmpeg();

        ffmpegInstance.on('progress', ({ progress }) => {
            const pct = Math.round(Math.max(0, Math.min(100, progress * 100)));
            progressEl.style.width = pct + '%';
            textEl.textContent = `Processing: ${pct}%`;
        });

        // Patch Worker to redirect the cross-origin 814.ffmpeg.js to our blob URL.
        //
        // NOTE: We must NOT pass classWorkerURL to ffmpegInstance.load() because
        // the UMD build forces {type:"module"} when classWorkerURL is set, but the
        // UMD worker (814.ffmpeg.js) uses importScripts() which is only available
        // in classic workers. Instead, we temporarily patch the Worker constructor
        // to intercept the cross-origin worker URL and swap in our blob URL while
        // keeping the worker type as classic.
        const OriginalWorker = window.Worker;
        window.Worker = class extends OriginalWorker {
            constructor(scriptURL, options) {
                const url = scriptURL instanceof URL ? scriptURL.href : String(scriptURL);
                if (url.includes('ffmpeg')) {
                    // Force classic worker — 814.ffmpeg.js uses importScripts()
                    // which is unavailable in module workers. Also, module workers
                    // cannot resolve blob:null/ URLs (file:// protocol).
                    const classicOpts = options ? { ...options } : {};
                    delete classicOpts.type;
                    super(workerBlobURL, classicOpts);
                } else {
                    super(scriptURL, options);
                }
            }
        };
        try {
            await ffmpegInstance.load({ coreURL, wasmURL });
        } finally {
            window.Worker = OriginalWorker;
        }
        progressEl.style.width = '100%';

        ffmpegLoaded = true;
        ffmpegLoading = false;
        overlay.classList.remove('active');
        return true;
    } catch (err) {
        console.error('FFmpeg load error:', err);
        ffmpegLoading = false;
        overlay.classList.remove('active');
        showStatus('Failed to load FFmpeg: ' + (err.message || err), 'error');
        return false;
    }
}

// Terminate the FFmpeg worker and drop the instance. The WASM heap never
// shrinks — after processing a large video its high-water mark would persist
// for the page lifetime, so exports release the instance when done. The next
// loadFFmpeg() re-creates it from the cached blob URLs in a second or two
// with no re-download.
function releaseFFmpeg() {
    if (ffmpegInstance) {
        try { ffmpegInstance.terminate(); } catch (e) {}
    }
    ffmpegInstance = null;
    ffmpegLoaded = false;
    ffmpegLoading = false;
}

function loadScript(src) {
    return new Promise((resolve, reject) => {
        // Skip if already loaded
        if (document.querySelector(`script[src="${src}"]`)) {
            resolve();
            return;
        }
        const s = document.createElement('script');
        s.src = src;
        s.onload = resolve;
        s.onerror = reject;
        document.head.appendChild(s);
    });
}

async function getVideoData() {
    // Return a fresh ArrayBuffer each time — avoids keeping the entire
    // video permanently in JS heap memory, which caused browser crashes
    // on large files.  File.arrayBuffer() re-reads from the OS file
    // reference so the cost is minimal.
    if (videoFile) {
        return await videoFile.arrayBuffer();
    } else {
        showStatus('Error: No video file loaded.', 'error');
        return null;
    }
}

function guessVideoExtension() {
    if (videoFile && videoFile.name) {
        const ext = videoFile.name.split('.').pop().toLowerCase();
        if (['mp4', 'webm', 'mkv', 'mov', 'avi'].includes(ext)) return ext;
    }
    return 'mp4';
}

async function extractClip(highlight) {
    const ext = guessVideoExtension();
    const outputName = `clip.${ext}`;

    const startTime = Math.max(0, highlight.timestamp - 3);
    const duration = 5; // 3 seconds before + 2 seconds after

    const overlay = document.getElementById('ffmpegLoading');
    const titleEl = document.getElementById('ffmpegLoadingTitle');
    const textEl = document.getElementById('ffmpegLoadingText');
    const progressEl = document.getElementById('ffmpegProgressFill');
    overlay.classList.add('active');
    titleEl.textContent = 'Extracting Clip...';
    textEl.textContent = 'Preparing video...';
    progressEl.style.width = '10%';

    let input = null;
    try {
        input = await mountVideoInput();
        if (!input) {
            overlay.classList.remove('active');
            return null;
        }
        progressEl.style.width = '30%';
        textEl.textContent = 'Trimming clip...';

        await ffmpegInstance.exec([
            '-ss', startTime.toFixed(2),
            '-i', input.path,
            '-t', duration.toFixed(2),
            '-c', 'copy',
            '-avoid_negative_ts', 'make_zero',
            outputName
        ]);
        progressEl.style.width = '90%';

        const outputData = await ffmpegInstance.readFile(outputName);
        progressEl.style.width = '100%';

        // Cleanup output
        await ffmpegInstance.deleteFile(outputName).catch(() => {});

        overlay.classList.remove('active');

        const mimeType = ext === 'webm' ? 'video/webm' : 'video/mp4';
        return new Blob([outputData.buffer], { type: mimeType });
    } catch (err) {
        console.error('Clip extraction error:', err);
        overlay.classList.remove('active');
        showStatus('Failed to extract clip. The video format may not be supported.', 'error');
        return null;
    } finally {
        if (input) await input.cleanup();
    }
}

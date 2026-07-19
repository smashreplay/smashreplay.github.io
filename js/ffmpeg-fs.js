// ─── FFmpeg input mounting ───
// Provides the source video to FFmpeg without copying the whole file into
// the WASM heap when possible. The primary path mounts the File via WORKERFS,
// which reads it on demand through blob slices — zero-copy, so a 1 GB video
// no longer produces a ~2 GB spike (JS ArrayBuffer + MEMFS copy) per write.
// If mounting fails the fallback copies the file into MEMFS as before.
//
// Usage:
//   const input = await mountVideoInput();
//   if (!input) return;
//   await ffmpegInstance.exec(['-i', input.path, ...]);
//   await input.cleanup();

const FFMPEG_MOUNT_DIR = '/work';

async function mountVideoInput() {
    if (!videoFile) {
        showStatus('Error: No video file loaded.', 'error');
        return null;
    }

    const inputName = 'input.' + guessVideoExtension();

    try {
        // Clear any leftover mount from a previous failed run, then mount.
        await ffmpegInstance.unmount(FFMPEG_MOUNT_DIR).catch(() => {});
        await ffmpegInstance.createDir(FFMPEG_MOUNT_DIR).catch(() => {});
        // Wrap the File to give it a predictable ASCII name inside the mount
        // (Blob composition is by reference — this does not copy the data).
        const mountFile = new File([videoFile], inputName, { type: videoFile.type });
        await ffmpegInstance.mount('WORKERFS', { files: [mountFile] }, FFMPEG_MOUNT_DIR);
        return {
            path: FFMPEG_MOUNT_DIR + '/' + inputName,
            cleanup: async () => {
                await ffmpegInstance.unmount(FFMPEG_MOUNT_DIR).catch(() => {});
                await ffmpegInstance.deleteDir(FFMPEG_MOUNT_DIR).catch(() => {});
            }
        };
    } catch (err) {
        console.warn('[FFmpeg] WORKERFS mount failed, falling back to MEMFS copy:', err);
        await ffmpegInstance.unmount(FFMPEG_MOUNT_DIR).catch(() => {});
        await ffmpegInstance.deleteDir(FFMPEG_MOUNT_DIR).catch(() => {});
    }

    // Fallback: copy the whole file into MEMFS (previous behavior). Callers
    // mount once per export, so even this path writes the file once instead
    // of once per clip.
    let data = await getVideoData();
    if (!data) return null;
    await ffmpegInstance.writeFile(inputName, new Uint8Array(data));
    data = null; // release JS-heap copy so GC can reclaim it
    return {
        path: inputName,
        cleanup: async () => {
            await ffmpegInstance.deleteFile(inputName).catch(() => {});
        }
    };
}

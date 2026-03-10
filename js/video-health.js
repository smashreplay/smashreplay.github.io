/**
 * Video Health Check — detects black/unrendered frames after upload.
 * Draws the current video frame to a small offscreen canvas and checks
 * average pixel brightness. Returns { isBlack, avgBrightness }.
 */

function checkVideoHealth(video) {
    var w = 64, h = 36;
    var canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    var ctx = canvas.getContext('2d');

    try {
        ctx.drawImage(video, 0, 0, w, h);
        var data = ctx.getImageData(0, 0, w, h).data;
    } catch (e) {
        console.warn('[Health] Could not read video pixels:', e);
        return { isBlack: false, avgBrightness: -1, error: true };
    }

    // Sample every 4th pixel for speed (R, G, B channels)
    var total = 0;
    var count = 0;
    for (var i = 0; i < data.length; i += 16) { // 16 = 4 channels * 4 skip
        total += data[i] + data[i + 1] + data[i + 2]; // R + G + B
        count += 3;
    }

    var avgBrightness = count > 0 ? total / count : 0;

    return {
        isBlack: avgBrightness < 5,
        avgBrightness: Math.round(avgBrightness * 100) / 100
    };
}

function showVideoHealthWarning() {
    var el = document.getElementById('videoHealthWarning');
    if (el) el.style.display = 'flex';
}

function hideVideoHealthWarning() {
    var el = document.getElementById('videoHealthWarning');
    if (el) el.style.display = 'none';
}

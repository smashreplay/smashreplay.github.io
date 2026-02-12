// ─── Timeline Overlay for Exported Video ───

const TIMELINE_COLORS = [
    '#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4', '#FFEAA7',
    '#DDA0DD', '#98D8C8', '#F7DC6F', '#BB8FCE', '#85C1E9',
    '#FF8C42', '#6BCB77', '#4D96FF', '#FF6F91', '#C9B1FF'
];

function generateTimelinePNG(clipCount, clipDurations, videoWidth, videoHeight) {
    const barHeight = Math.max(28, Math.round(videoHeight * 0.04));
    const margin = Math.round(videoWidth * 0.03);
    const barY = 8;
    const canvasHeight = barHeight + barY * 2;
    const barWidth = videoWidth - margin * 2;

    const canvas = document.createElement('canvas');
    canvas.width = videoWidth;
    canvas.height = canvasHeight;
    const ctx = canvas.getContext('2d');

    // Semi-transparent dark background
    ctx.fillStyle = 'rgba(0, 0, 0, 0.55)';
    ctx.beginPath();
    ctx.roundRect(margin - 6, 0, barWidth + 12, canvasHeight, 8);
    ctx.fill();

    const totalDuration = clipDurations.reduce((a, b) => a + b, 0);
    const gap = Math.min(3, Math.round(barWidth * 0.004));
    const totalGaps = gap * (clipCount - 1);
    const usableWidth = barWidth - totalGaps;
    let x = margin;

    for (let i = 0; i < clipCount; i++) {
        const w = (clipDurations[i] / totalDuration) * usableWidth;
        const color = TIMELINE_COLORS[i % TIMELINE_COLORS.length];

        // Colored segment
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.roundRect(x, barY, w, barHeight, 4);
        ctx.fill();

        // Clip number label
        if (w > 20) {
            ctx.fillStyle = '#000';
            ctx.font = `bold ${Math.round(barHeight * 0.5)}px sans-serif`;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(`${i + 1}`, x + w / 2, barY + barHeight / 2);
        }

        x += w + gap;
    }

    // Convert canvas to PNG Uint8Array
    const dataUrl = canvas.toDataURL('image/png');
    const binary = atob(dataUrl.split(',')[1]);
    const arr = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) arr[i] = binary.charCodeAt(i);
    return arr;
}

function generateCounterPNG(clipNumber, totalClips, videoWidth, videoHeight) {
    const fontSize = Math.max(16, Math.round(videoHeight * 0.04));
    const text = `${clipNumber}/${totalClips}`;
    const padX = Math.round(fontSize * 0.6);
    const padY = Math.round(fontSize * 0.35);
    const radius = Math.round(fontSize * 0.25);

    // Measure text width with an off-screen canvas
    const measure = document.createElement('canvas');
    const mCtx = measure.getContext('2d');
    mCtx.font = `bold ${fontSize}px sans-serif`;
    const metrics = mCtx.measureText(text);
    const textWidth = Math.ceil(metrics.width);

    const canvas = document.createElement('canvas');
    canvas.width = textWidth + padX * 2;
    canvas.height = fontSize + padY * 2;
    const ctx = canvas.getContext('2d');

    // Semi-transparent dark pill background
    ctx.fillStyle = 'rgba(0, 0, 0, 0.65)';
    ctx.beginPath();
    ctx.roundRect(0, 0, canvas.width, canvas.height, radius);
    ctx.fill();

    // White bold text
    ctx.fillStyle = '#fff';
    ctx.font = `bold ${fontSize}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, canvas.width / 2, canvas.height / 2);

    // Convert canvas to PNG Uint8Array
    const dataUrl = canvas.toDataURL('image/png');
    const binary = atob(dataUrl.split(',')[1]);
    const arr = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) arr[i] = binary.charCodeAt(i);
    return arr;
}

// ─── Counter Overlay for Exported Video ───

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

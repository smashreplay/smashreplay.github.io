function drawMotionChart() {
    const container = document.getElementById('motionChartContainer');
    const canvas = document.getElementById('motionChart');
    if (!canvas || chartData.length === 0) return;

    // Ensure container is visible before measuring
    if (container.style.display === 'none') {
        container.style.display = 'block';
    }

    // Size canvas to match CSS layout (avoids blurry rendering)
    const cssW = canvas.clientWidth;
    const cssH = canvas.clientHeight;
    if (cssW === 0 || cssH === 0) return; // not laid out yet
    canvas.width = cssW * 2;
    canvas.height = cssH * 2;
    const ctx = canvas.getContext('2d');
    ctx.scale(2, 2);

    const W = cssW;
    const H = cssH;
    const pad = { top: 8, bottom: 18, left: 30, right: 8 };
    const plotW = W - pad.left - pad.right;
    const plotH = H - pad.top - pad.bottom;
    const duration = document.getElementById('processingVideo').duration || 1;

    // Background
    ctx.fillStyle = '#1a1a2e';
    ctx.fillRect(0, 0, W, H);

    // Collect all motion and threshold values across all regions
    const regionCount = chartData.length > 0 ? chartData[0].motions.length : 1;
    const allValues = [];
    chartData.forEach(d => {
        d.motions.forEach(m => allValues.push(m));
        d.thresholds.forEach(t => allValues.push(t));
    });

    // Cap y-axis at 95th percentile for readability
    allValues.sort((a, b) => a - b);
    const p95 = allValues[Math.floor(allValues.length * 0.95)] || 10;
    const maxY = Math.max(10, p95 * 1.2);

    // Grid lines
    ctx.strokeStyle = 'rgba(255,255,255,0.08)';
    ctx.lineWidth = 1;
    for (let i = 0; i <= 4; i++) {
        const y = pad.top + (plotH / 4) * i;
        ctx.beginPath();
        ctx.moveTo(pad.left, y);
        ctx.lineTo(W - pad.right, y);
        ctx.stroke();
    }

    // Y-axis labels
    ctx.fillStyle = '#666';
    ctx.font = '9px sans-serif';
    ctx.textAlign = 'right';
    for (let i = 0; i <= 4; i++) {
        const y = pad.top + (plotH / 4) * i;
        const val = Math.round(maxY * (1 - i / 4));
        ctx.fillText(val, pad.left - 3, y + 3);
    }

    // X-axis time labels
    ctx.textAlign = 'center';
    const timeSteps = Math.max(1, Math.min(6, Math.ceil(duration / 30)));
    for (let i = 0; i <= timeSteps; i++) {
        const t = (duration / timeSteps) * i;
        const x = pad.left + (t / duration) * plotW;
        ctx.fillText(formatTime(t), x, H - 2);
    }

    // Detection markers (green vertical bars)
    chartDetections.forEach(t => {
        const x = pad.left + (t / duration) * plotW;
        ctx.fillStyle = 'rgba(76, 175, 80, 0.25)';
        ctx.fillRect(x - 3, pad.top, 6, plotH);
        ctx.fillStyle = '#4CAF50';
        ctx.beginPath();
        ctx.arc(x, pad.top + 4, 3, 0, Math.PI * 2);
        ctx.fill();
    });

    // Line drawing helper — clamps values at maxY
    function line(color, lw, dash, fn) {
        ctx.strokeStyle = color;
        ctx.lineWidth = lw;
        if (dash) ctx.setLineDash(dash);
        ctx.beginPath();
        chartData.forEach((d, i) => {
            const x = pad.left + (d.time / duration) * plotW;
            const y = pad.top + plotH * (1 - Math.min(1, fn(d) / maxY));
            i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
        });
        ctx.stroke();
        if (dash) ctx.setLineDash([]);
    }

    // Colors per region
    const motionColors = ['#4fc3f7', '#ce93d8'];
    const threshColors = ['rgba(255, 82, 82, 0.6)', 'rgba(255, 167, 38, 0.6)'];

    // Draw per-region threshold and motion lines
    for (let r = 0; r < regionCount; r++) {
        line(threshColors[r % threshColors.length], 1, [3, 3], d => d.thresholds[r]);
        line(motionColors[r % motionColors.length], 1.5, null, d => d.motions[r]);
    }
}

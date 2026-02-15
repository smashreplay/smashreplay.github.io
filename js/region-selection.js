function initSelectionCanvas() {
    const video = document.getElementById('videoPlayer');
    selectionCanvas = document.getElementById('selectionCanvas');
    selectionCtx = selectionCanvas.getContext('2d');

    // Match canvas size to video element
    const updateCanvasSize = () => {
        const rect = video.getBoundingClientRect();
        selectionCanvas.width = rect.width;
        selectionCanvas.height = rect.height;
        redrawRegion();
    };

    updateCanvasSize();
    window.addEventListener('resize', updateCanvasSize);

    // Interaction handlers for draggable overlay
    selectionCanvas.addEventListener('mousedown', handleOverlayPointerDown);
    selectionCanvas.addEventListener('mousemove', handleOverlayPointerMove);
    selectionCanvas.addEventListener('mouseup', handleOverlayPointerUp);
    selectionCanvas.addEventListener('touchstart', handleOverlayPointerDown, { passive: false });
    selectionCanvas.addEventListener('touchmove', handleOverlayPointerMove, { passive: false });
    selectionCanvas.addEventListener('touchend', handleOverlayPointerUp, { passive: false });
}

// Draggable/resizable overlay state
let overlayRegion = null;      // The region being edited {x, y, width, height} in normalized coords
let overlayDragType = null;    // 'move', 'tl', 'tr', 'bl', 'br' (corners)
let overlayDragStart = null;   // {x, y} in normalized coords where drag started
let overlayOriginal = null;    // Copy of region at drag start
const HANDLE_SIZE = 15;        // px — touch-friendly handle radius
const MIN_REGION_SIZE = 0.02;  // Minimum 8% of video in either dimension

function getPointerPos(e) {
    const rect = selectionCanvas.getBoundingClientRect();
    const touch = e.touches ? e.touches[0] : (e.changedTouches ? e.changedTouches[0] : e);
    return {
        px: (touch.clientX || e.clientX) - rect.left,
        py: (touch.clientY || e.clientY) - rect.top,
        nx: ((touch.clientX || e.clientX) - rect.left) / selectionCanvas.width,
        ny: ((touch.clientY || e.clientY) - rect.top) / selectionCanvas.height
    };
}

function hitTestOverlay(px, py) {
    if (!overlayRegion) return null;
    const r = overlayRegion;
    const x = r.x * selectionCanvas.width;
    const y = r.y * selectionCanvas.height;
    const w = r.width * selectionCanvas.width;
    const h = r.height * selectionCanvas.height;
    const hs = HANDLE_SIZE;

    // Test corners first (larger hit area for touch)
    if (Math.abs(px - x) < hs && Math.abs(py - y) < hs) return 'tl';
    if (Math.abs(px - (x + w)) < hs && Math.abs(py - y) < hs) return 'tr';
    if (Math.abs(px - x) < hs && Math.abs(py - (y + h)) < hs) return 'bl';
    if (Math.abs(px - (x + w)) < hs && Math.abs(py - (y + h)) < hs) return 'br';

    // Test inside box for move
    if (px >= x && px <= x + w && py >= y && py <= y + h) return 'move';

    return null;
}

function handleOverlayPointerDown(e) {
    if (!isSelectingRegion || !overlayRegion) return;
    e.preventDefault();
    const pos = getPointerPos(e);
    const hit = hitTestOverlay(pos.px, pos.py);
    if (!hit) return;

    overlayDragType = hit;
    overlayDragStart = { nx: pos.nx, ny: pos.ny };
    overlayOriginal = { ...overlayRegion };
}

function handleOverlayPointerMove(e) {
    if (!isSelectingRegion || !overlayRegion) return;
    e.preventDefault();
    const pos = getPointerPos(e);

    if (!overlayDragType) {
        // Update cursor based on hover
        const hit = hitTestOverlay(pos.px, pos.py);
        if (hit === 'move') selectionCanvas.style.cursor = 'grab';
        else if (hit) selectionCanvas.style.cursor = 'nwse-resize';
        else selectionCanvas.style.cursor = 'default';
        return;
    }

    // Active drag
    selectionCanvas.style.cursor = overlayDragType === 'move' ? 'grabbing' : 'nwse-resize';
    const dx = pos.nx - overlayDragStart.nx;
    const dy = pos.ny - overlayDragStart.ny;
    const o = overlayOriginal;

    if (overlayDragType === 'move') {
        overlayRegion.x = Math.max(0, Math.min(1 - o.width, o.x + dx));
        overlayRegion.y = Math.max(0, Math.min(1 - o.height, o.y + dy));
    } else {
        // Corner resize
        let newX = o.x, newY = o.y, newW = o.width, newH = o.height;

        if (overlayDragType === 'tl') {
            newX = o.x + dx;
            newY = o.y + dy;
            newW = o.width - dx;
            newH = o.height - dy;
        } else if (overlayDragType === 'tr') {
            newY = o.y + dy;
            newW = o.width + dx;
            newH = o.height - dy;
        } else if (overlayDragType === 'bl') {
            newX = o.x + dx;
            newW = o.width - dx;
            newH = o.height + dy;
        } else if (overlayDragType === 'br') {
            newW = o.width + dx;
            newH = o.height + dy;
        }

        // Enforce minimum size
        if (newW >= MIN_REGION_SIZE && newH >= MIN_REGION_SIZE) {
            overlayRegion.x = Math.max(0, Math.min(1 - MIN_REGION_SIZE, newX));
            overlayRegion.y = Math.max(0, Math.min(1 - MIN_REGION_SIZE, newY));
            overlayRegion.width = Math.min(newW, 1 - overlayRegion.x);
            overlayRegion.height = Math.min(newH, 1 - overlayRegion.y);
        }
    }

    drawOverlay();
}

function handleOverlayPointerUp(e) {
    if (!isSelectingRegion) return;
    e.preventDefault();
    overlayDragType = null;
    overlayDragStart = null;
    overlayOriginal = null;
    if (overlayRegion) {
        const hit = hitTestOverlay(getPointerPos(e).px, getPointerPos(e).py);
        selectionCanvas.style.cursor = hit === 'move' ? 'grab' : (hit ? 'nwse-resize' : 'default');
    }
}

function drawOverlay() {
    if (!selectionCanvas) return;
    selectionCtx.clearRect(0, 0, selectionCanvas.width, selectionCanvas.height);

    // Dark overlay
    selectionCtx.fillStyle = 'rgba(0, 0, 0, 0.5)';
    selectionCtx.fillRect(0, 0, selectionCanvas.width, selectionCanvas.height);

    if (!overlayRegion) return;

    const r = overlayRegion;
    const x = r.x * selectionCanvas.width;
    const y = r.y * selectionCanvas.height;
    const w = r.width * selectionCanvas.width;
    const h = r.height * selectionCanvas.height;

    const colors = ['#667eea', '#f5576c'];
    const color = colors[basketRegions.length % colors.length];

    // Clear the region area (make it bright/visible)
    selectionCtx.clearRect(x, y, w, h);

    // Draw border
    selectionCtx.strokeStyle = color;
    selectionCtx.lineWidth = 3;
    selectionCtx.strokeRect(x, y, w, h);

    // Draw corner handles
    const hs = 5; // visual handle half-size
    const corners = [
        [x, y], [x + w, y],
        [x, y + h], [x + w, y + h]
    ];
    corners.forEach(([cx, cy]) => {
        selectionCtx.fillStyle = 'white';
        selectionCtx.beginPath();
        selectionCtx.arc(cx, cy, hs, 0, Math.PI * 2);
        selectionCtx.fill();
        selectionCtx.strokeStyle = color;
        selectionCtx.lineWidth = 3;
        selectionCtx.stroke();
    });

    // Draw label
    const label = `BASKET ${basketRegions.length + 1}`;
    selectionCtx.font = 'bold 12px sans-serif';
    const textWidth = selectionCtx.measureText(label).width;
    selectionCtx.fillStyle = color;
    selectionCtx.fillRect(x, y - 24, textWidth + 10, 22);
    selectionCtx.fillStyle = 'white';
    selectionCtx.fillText(label, x + 5, y - 9);
}

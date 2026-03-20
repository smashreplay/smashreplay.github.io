function syncCanvasSize() {
    if (!selectionCanvas) return;
    // Prefer the canvas's own rendered rect so buffer & touch coords share the same reference frame.
    // Fall back to the video rect when the canvas is hidden (rect.width === 0).
    const canvasRect = selectionCanvas.getBoundingClientRect();
    const video = document.getElementById('videoPlayer');
    const videoRect = video.getBoundingClientRect();
    const w = canvasRect.width > 0 ? canvasRect.width : videoRect.width;
    const h = canvasRect.height > 0 ? canvasRect.height : videoRect.height;
    if (w > 0) {
        selectionCanvas.width = w;
        selectionCanvas.height = h;
    }
    redrawRegion();
}

function initSelectionCanvas() {
    selectionCanvas = document.getElementById('selectionCanvas');
    selectionCtx = selectionCanvas.getContext('2d');

    syncCanvasSize();
    window.addEventListener('resize', syncCanvasSize);
    window.addEventListener('orientationchange', () => setTimeout(syncCanvasSize, 150));

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
const HANDLE_SIZE = 17;        // px — touch-friendly handle radius
const MIN_REGION_SIZE = 0.02;  // Minimum 8% of video in either dimension

function getPointerPos(e) {
    const rect = selectionCanvas.getBoundingClientRect();
    const touch = e.touches ? e.touches[0] : (e.changedTouches ? e.changedTouches[0] : e);
    const cx = (touch.clientX || e.clientX) - rect.left;
    const cy = (touch.clientY || e.clientY) - rect.top;
    // Normalize using the canvas's own rendered size so touch coords and
    // canvas buffer coords share the same reference frame.
    return {
        px: cx,
        py: cy,
        nx: cx / rect.width,
        ny: cy / rect.height
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

const DEFAULT_CLICK_W = 0.14;
const DEFAULT_CLICK_H = 0.16;

function handleClickToPlace(e) {
    e.preventDefault();
    const pos = getPointerPos(e);
    const x = Math.max(0, Math.min(1 - DEFAULT_CLICK_W, pos.nx - DEFAULT_CLICK_W / 2));
    const y = Math.max(0, Math.min(1 - DEFAULT_CLICK_H, pos.ny - DEFAULT_CLICK_H / 2));
    overlayRegion = { x, y, width: DEFAULT_CLICK_W, height: DEFAULT_CLICK_H };
    drawOverlay();
    confirmOverlaySelection();
}

function handleOverlayPointerDown(e) {
    if (!isSelectingRegion) return;
    if (basketSelectionMode === 'click') { handleClickToPlace(e); return; }
    if (!overlayRegion) return;
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

function drawBasketGuide(ctx, x, y, w, h, color) {
    // Trapezoid representing basketball hoop (wide top) narrowing to net (narrow bottom)
    const topInset = w * TRAP_TOP_INSET;
    const bottomInset = w * TRAP_BOTTOM_INSET;
    const topY = y + h * TRAP_TOP_Y;
    const bottomY = y + h * TRAP_BOTTOM_Y;
    const topLeft  = x + topInset;
    const topRight = x + w - topInset;
    const botLeft  = x + bottomInset;
    const botRight = x + w - bottomInset;

    // Semi-transparent fill
    ctx.beginPath();
    ctx.moveTo(topLeft, topY);
    ctx.lineTo(topRight, topY);
    ctx.lineTo(botRight, bottomY);
    ctx.lineTo(botLeft,  bottomY);
    ctx.closePath();
    ctx.fillStyle = 'rgba(255, 255, 255, 0.08)';
    ctx.fill();

    // Dashed outline for three sides: left diagonal, top edge, right diagonal
    ctx.beginPath();
    ctx.moveTo(botLeft, bottomY);
    ctx.lineTo(topLeft, topY);
    ctx.lineTo(topRight, topY);
    ctx.lineTo(botRight, bottomY);
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.4)';
    ctx.lineWidth = 1.5;
    ctx.setLineDash([5, 4]);
    ctx.stroke();
    ctx.setLineDash([]);

    // Solid colored bottom edge (net base)
    ctx.beginPath();
    ctx.moveTo(botLeft, bottomY);
    ctx.lineTo(botRight, bottomY);
    ctx.strokeStyle = color;
    ctx.lineWidth = 2.5;
    ctx.stroke();

    // Solid accent line at the top edge (represents the rim)
    ctx.beginPath();
    ctx.moveTo(topLeft, topY);
    ctx.lineTo(topRight, topY);
    ctx.strokeStyle = color;
    ctx.lineWidth = 2.5;
    ctx.stroke();
}

function drawOverlay() {
    if (!selectionCanvas) return;
    selectionCtx.clearRect(0, 0, selectionCanvas.width, selectionCanvas.height);

    // Dark overlay
    selectionCtx.fillStyle = 'rgba(0, 0, 0, 0.5)';
    selectionCtx.fillRect(0, 0, selectionCanvas.width, selectionCanvas.height);

    // In click mode with room for more regions, show a tap hint
    if (basketSelectionMode === 'click' && basketRegions.length < getMaxRegions()) {
        const cw = selectionCanvas.width;
        const ch = selectionCanvas.height;
        const hint = 'Tap where the basket is \u2191';
        selectionCtx.font = 'bold 16px sans-serif';
        const tw = selectionCtx.measureText(hint).width;
        const px = (cw - tw) / 2;
        const py = ch * 0.18;
        selectionCtx.fillStyle = 'rgba(0,0,0,0.55)';
        selectionCtx.fillRect(px - 10, py - 22, tw + 20, 34);
        selectionCtx.fillStyle = 'white';
        selectionCtx.fillText(hint, px, py);
    }

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

    // Draw basketball net/hoop guide inside the box
    drawBasketGuide(selectionCtx, x, y, w, h, color);

    // Draw border
    selectionCtx.strokeStyle = color;
    selectionCtx.lineWidth = 3;
    selectionCtx.strokeRect(x, y, w, h);

    // Draw corner handles
    const hs = 9; // visual handle half-size
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

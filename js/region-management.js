function toggleRegionSelection() {
    if (basketRegions.length >= MAX_REGIONS && !isSelectingRegion) {
        return;
    }

    isSelectingRegion = !isSelectingRegion;

    const canvas = document.getElementById('selectionCanvas');
    const btn = document.getElementById('selectRegionBtn');
    const help = document.getElementById('regionHelp');
    const overlayControls = document.getElementById('basketOverlayControls');

    if (isSelectingRegion) {
        canvas.classList.add('active');
        canvas.classList.remove('has-regions');
        btn.textContent = '✕ Cancel Selection';
        btn.classList.remove('btn-secondary');
        btn.classList.add('btn-primary');
        help.style.display = 'block';
        overlayControls.classList.add('active');
        document.getElementById('videoPlayer').pause();

        // Create a default overlay region centered on the video
        overlayRegion = { x: 0.35, y: 0.25, width: 0.30, height: 0.35 };
        drawOverlay();
    } else {
        canvas.classList.remove('active');
        if (basketRegions.length > 0) canvas.classList.add('has-regions');
        btn.textContent = '📍 Add Basket Region';
        btn.classList.remove('btn-primary');
        btn.classList.add('btn-secondary');
        help.style.display = 'none';
        overlayControls.classList.remove('active');
        overlayRegion = null;
        redrawRegion();
    }
}

function confirmOverlaySelection() {
    if (!overlayRegion) return;

    const regionNumber = basketRegions.length + 1;
    const colors = ['#667eea', '#f5576c'];

    const newRegion = {
        x: overlayRegion.x,
        y: overlayRegion.y,
        width: overlayRegion.width,
        height: overlayRegion.height,
        number: regionNumber,
        color: colors[(regionNumber - 1) % colors.length]
    };

    basketRegions.push(newRegion);
    updateRegionDisplay();
    toggleRegionSelection();
}

function cancelOverlaySelection() {
    if (isSelectingRegion) {
        toggleRegionSelection();
    }
}

function clearLastRegion() {
    if (basketRegions.length > 0) {
        basketRegions.pop();
        updateRegionDisplay();
        showStatus('Last basket region removed.', 'complete');
    }
}

function clearAllRegions() {
    basketRegions = [];
    updateRegionDisplay();
    showStatus('All basket regions cleared. Will use full frame detection.', 'complete');
}

function updateRegionDisplay() {
    const indicator = document.getElementById('regionIndicator');
    const regionList = document.getElementById('regionList');
    const selectBtn = document.getElementById('selectRegionBtn');

    if (basketRegions.length === 0) {
        regionList.innerHTML = 'None selected';
        indicator.classList.remove('set');
        document.getElementById('clearRegionBtn').style.display = 'none';
        selectBtn.disabled = false;
        selectBtn.textContent = '📍 Add Basket Region';
    } else {
        const badges = basketRegions.map((r, i) =>
            `<span class="region-badge" style="background: ${r.color}">Region ${r.number}</span>`
        ).join(' ');
        regionList.innerHTML = badges;
        indicator.classList.add('set');
        document.getElementById('clearRegionBtn').style.display = 'inline-flex';
        selectBtn.disabled = basketRegions.length >= MAX_REGIONS;
        if (basketRegions.length >= MAX_REGIONS) {
            selectBtn.textContent = 'Max regions reached';
        } else {
            selectBtn.textContent = '📍 Add Basket Region';
        }
    }

    redrawRegion();
    updateGuidedWorkflow();
}

function updateGuidedWorkflow() {
    const processBtn = document.getElementById('processBtn');
    const setupGuide = document.getElementById('setupGuide');
    const nextStepsPanel = document.getElementById('nextStepsPanel');

    if (basketRegions.length === 0) {
        processBtn.style.display = 'block';
        processBtn.innerHTML = '<span>▶ Start Detection (Full Frame)</span>';
        if (nextStepsPanel) nextStepsPanel.style.display = 'none';
    } else {
        processBtn.style.display = 'none'; // hide standalone button; next-steps panel takes over
        setupGuide.style.display = 'none';

        if (!nextStepsPanel) {
            // Create the next-steps panel once
            const panel = document.createElement('div');
            panel.id = 'nextStepsPanel';
            panel.style.cssText = 'margin-top: 15px; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 18px; border-radius: 12px; color: white; animation: fadeSlideIn 0.4s ease;';
            processBtn.parentNode.insertBefore(panel, processBtn);
        }

        const panel = document.getElementById('nextStepsPanel');
        panel.style.display = 'block';

        if (basketRegions.length < MAX_REGIONS) {
            panel.innerHTML = `
                <div style="font-weight: 700; font-size: 15px; margin-bottom: 12px;">Basket ${basketRegions.length} selected!</div>
                <div style="display: flex; gap: 10px;">
                    <button class="btn" onclick="processVideo()" style="flex: 1; background: #4CAF50; color: white; border: none; font-weight: 700; font-size: 15px; padding: 14px;">
                        Start Detection
                    </button>
                    <button class="btn" onclick="startRegionSelection()" style="flex: 1; background: rgba(255,255,255,0.2); color: white; border: 1px solid rgba(255,255,255,0.4); font-size: 14px; padding: 14px;">
                        Add Basket ${basketRegions.length + 1}
                    </button>
                </div>
                <div style="font-size: 12px; opacity: 0.8; margin-top: 8px; text-align: center;">Adding both baskets improves accuracy</div>
            `;
        } else {
            panel.innerHTML = `
                <div style="font-weight: 700; font-size: 15px; margin-bottom: 12px;">Both baskets selected!</div>
                <button class="btn" onclick="processVideo()" style="width: 100%; background: #4CAF50; color: white; border: none; font-weight: 700; font-size: 16px; padding: 16px; animation: pulseGlow 1.5s ease-in-out infinite;">
                    Start Detection
                </button>
            `;
        }

        // Scroll the panel into view
        panel.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
}

function startRegionSelection() {
    if (basketRegions.length >= MAX_REGIONS) {
        showStatus(`Maximum ${MAX_REGIONS} basket regions allowed.`, 'complete');
        return;
    }
    toggleRegionSelection();
}

function redrawRegion() {
    if (!selectionCanvas) return;

    selectionCtx.clearRect(0, 0, selectionCanvas.width, selectionCanvas.height);

    // Manage has-regions class for passive display
    if (basketRegions.length > 0 && !isSelectingRegion) {
        selectionCanvas.classList.add('has-regions');

        // Draw semi-transparent overlay
        selectionCtx.fillStyle = 'rgba(0, 0, 0, 0.3)';
        selectionCtx.fillRect(0, 0, selectionCanvas.width, selectionCanvas.height);

        // Draw each saved region
        basketRegions.forEach(region => {
            const x = region.x * selectionCanvas.width;
            const y = region.y * selectionCanvas.height;
            const width = region.width * selectionCanvas.width;
            const height = region.height * selectionCanvas.height;

            // Clear the region
            selectionCtx.clearRect(x, y, width, height);

            // Draw colored border
            selectionCtx.strokeStyle = region.color;
            selectionCtx.lineWidth = 3;
            selectionCtx.strokeRect(x, y, width, height);

            // Draw label with background — position above the box
            const label = `BASKET ${region.number}`;
            selectionCtx.font = 'bold 12px sans-serif';
            const textWidth = selectionCtx.measureText(label).width;
            const labelY = y > 26 ? y - 26 : y + height + 4;

            selectionCtx.fillStyle = region.color;
            selectionCtx.fillRect(x, labelY, textWidth + 10, 22);

            selectionCtx.fillStyle = 'white';
            selectionCtx.fillText(label, x + 5, labelY + 15);
        });
    } else if (!isSelectingRegion) {
        selectionCanvas.classList.remove('has-regions');
    }
}

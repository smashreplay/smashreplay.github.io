// Returns array of per-region motion values, or [fullFrameMotion] if no regions
function detectMotion(frame1, frame2) {
    const data1 = frame1.data;
    const data2 = frame2.data;
    const width = frame1.width;
    const height = frame1.height;

    if (basketRegions.length > 0) {
        return basketRegions.map(region => {
            const startX = Math.floor(region.x * width);
            const startY = Math.floor(region.y * height);
            const endX = Math.floor((region.x + region.width) * width);
            const endY = Math.floor((region.y + region.height) * height);

            let regionDiff = 0;
            let regionCount = 0;

            for (let y = startY; y < endY; y += 2) {
                for (let x = startX; x < endX; x += 2) {
                    const idx = (y * width + x) * 4;
                    const r = Math.abs(data1[idx] - data2[idx]);
                    const g = Math.abs(data1[idx + 1] - data2[idx + 1]);
                    const b = Math.abs(data1[idx + 2] - data2[idx + 2]);
                    regionDiff += (r + g + b) / 3;
                    regionCount++;
                }
            }

            return regionCount > 0 ? regionDiff / regionCount : 0;
        });
    } else {
        let diff = 0;
        let count = 0;
        for (let i = 0; i < data1.length; i += 40) {
            const r = Math.abs(data1[i] - data2[i]);
            const g = Math.abs(data1[i + 1] - data2[i + 1]);
            const b = Math.abs(data1[i + 2] - data2[i + 2]);
            diff += (r + g + b) / 3;
            count++;
        }
        return [diff / count];
    }
}

function initRegionEMAs() {
    const count = Math.max(1, basketRegions.length);
    regionEMAs = [];
    for (let i = 0; i < count; i++) {
        regionEMAs.push({ mean: 0, variance: 0, initialized: false });
    }
}

function updateRegionEMA(regionIdx, motion) {
    const ema = regionEMAs[regionIdx];
    if (!ema.initialized) {
        ema.mean = motion;
        ema.variance = 0;
        ema.initialized = true;
        return;
    }
    const diff = motion - ema.mean;
    ema.mean += EMA_ALPHA * diff;
    ema.variance = (1 - EMA_ALPHA) * (ema.variance + EMA_ALPHA * diff * diff);
}

function getScaledMinThreshold(regionIdx) {
    if (basketRegions.length === 0 || regionIdx >= basketRegions.length) return MIN_THRESHOLD;
    const region = basketRegions[regionIdx];
    const regionArea = region.width * region.height;
    const referenceArea = 0.01; // 10% × 10% — small hoop-sized region
    if (regionArea <= referenceArea) return MIN_THRESHOLD;
    const scale = Math.sqrt(referenceArea / regionArea);
    return Math.max(0.3, MIN_THRESHOLD * scale);
}

function getRegionThreshold(regionIdx) {
    const ema = regionEMAs[regionIdx];
    const minT = getScaledMinThreshold(regionIdx);
    if (!ema || !ema.initialized) return minT;
    const stdDev = Math.sqrt(Math.max(0, ema.variance));
    return Math.max(minT, ema.mean + ANOMALY_K * stdDev);
}

// motionHistories: array of arrays, one per region
// Each inner array is the last N motion values for that region
function calculateBasketScore(motionHistories, time) {
    let bestScore = 0;
    let bestReasons = [];
    let bestMotion = 0;
    let bestThreshold = getScaledMinThreshold(0);
    let bestRegionIdx = 0;

    motionHistories.forEach((history, rIdx) => {
        const currentMotion = history[history.length - 1];
        const threshold = getRegionThreshold(rIdx);
        const ceiling = threshold * CEILING_K;

        const isAnomaly = currentMotion > threshold;
        const isTooBig = currentMotion > ceiling;

        // Brief burst check in last 4 frames
        const recentAbove = history.slice(-4).filter(m => m > threshold).length;
        const isBrief = recentAbove >= 1 && recentAbove <= 2;
        const isSustained = recentAbove >= 3;

        let score = 0;
        let reasons = [];

        if (isTooBig) {
            // Motion too large — likely a person, not a ball
            score = 0;
            reasons.push('(too large)');
        } else if (isAnomaly && isBrief) {
            score += 70;
            reasons.push('Anomaly Burst');
        } else if (isAnomaly && !isSustained) {
            score += 40;
            reasons.push('Anomaly');
        }

        // Spike/drop pattern bonus
        const avgRecent = history.slice(-2).reduce((a, b) => a + b) / 2;
        const earlier = history.slice(-5, -2);
        const avgEarlier = earlier.length > 0 ? earlier.reduce((a, b) => a + b) / earlier.length : 0;
        if (avgRecent > avgEarlier * 2 && avgRecent > threshold * 0.8 && !isTooBig) {
            score += 20;
            reasons.push('Sharp Spike');
        }

        if (isSustained) {
            score = Math.max(0, score - 50);
            reasons.push('(sustained)');
        }

        // Update EMA AFTER scoring
        updateRegionEMA(rIdx, currentMotion);

        if (score > bestScore) {
            bestScore = score;
            bestReasons = reasons;
            bestMotion = currentMotion;
            bestThreshold = threshold;
            bestRegionIdx = rIdx;
        }
    });

    return {
        score: bestScore, motion: bestMotion, rim: 0, ball: 0,
        threshold: bestThreshold, regionIndex: bestRegionIdx,
        motionDrop: false, rimVisible: false, ballPresent: false,
        reasons: bestReasons,
        passes: bestScore >= 50
    };
}

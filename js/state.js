let videoFile = null;
let highlights = [];
let settings = {
    minGap: 3  // Minimum gap between clips in seconds
};

// Court type: 'half' (1 basket) or 'full' (2 baskets)
let courtType = null;

// Region selection variables - now supports multiple regions
let basketRegions = [];
let isSelectingRegion = false;
let selectionCanvas = null;
let selectionCtx = null;
function getMaxRegions() { return courtType === 'full' ? 2 : 1; }

// Playback mode variables
let isPlayingAll = false;
let currentHighlightIndex = 0;
let isTheaterMode = false;
let playAllListener = null;

// Motion chart data
let chartData = [];        // {time, motions[], thresholds[], detected}
let chartDetections = [];  // timestamps where detections fired

// Trapezoid geometry (fractions of the bounding rectangle)
const TRAP_TOP_INSET = 0.25;     // inset from each side at top edge
const TRAP_BOTTOM_INSET = 0.45;  // inset from each side at bottom edge
const TRAP_TOP_Y = 0.30;         // top edge position (fraction of height)
const TRAP_BOTTOM_Y = 0.70;      // bottom edge position (fraction of height)
const TRAP_MARGIN = 0.03;        // extra margin around trapezoid for detection

// EMA anomaly detection state — per region
const EMA_ALPHA = 0.08;    // Smoothing factor — lower = slower adaptation
const ANOMALY_K = 2;       // Std deviations above mean to trigger
const CEILING_K = 6;       // Motion above threshold * this = too big (person)
const MIN_THRESHOLD = 2.5; // Floor so tiny noise doesn't trigger in dead-still scenes
let regionEMAs = [];       // [{mean, variance, initialized}] per region

// FFmpeg state
let ffmpegInstance = null;
let ffmpegLoaded = false;
let ffmpegLoading = false;
// videoDataForFFmpeg removed — reading fresh from File each time
// avoids keeping the entire video permanently in JS heap memory

// Performance diagnostics state
let perfStats = null;

// ─── Backend Configuration ───
// Set to your upload endpoint to enable the Share feature.
// Empty string ('') = "Coming soon" mode — no upload will be attempted.
const UPLOAD_BACKEND_URL = '';

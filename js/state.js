let currentTab = 'file';
let videoFile = null;
let highlights = [];
let settings = {
    minGap: 3  // Minimum gap between clips in seconds
};

// Region selection variables - now supports multiple regions
let basketRegions = [];
let isSelectingRegion = false;
let selectionCanvas = null;
let selectionCtx = null;
const MAX_REGIONS = 2;

// Playback mode variables
let isPlayingAll = false;
let currentHighlightIndex = 0;
let isTheaterMode = false;
let playAllListener = null;

// Motion chart data
let chartData = [];        // {time, motions[], thresholds[], detected}
let chartDetections = [];  // timestamps where detections fired

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

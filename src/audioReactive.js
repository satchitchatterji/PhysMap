// Audio-reactive signal capture and normalization.
// The renderer only consumes the small `levels` object returned by sample().

const TAU = Math.PI * 2;

export const AUDIO_BANDS = ['bass', 'mids', 'treble', 'overall'];

export function clamp(value, min = 0, max = 1) {
  return Math.max(min, Math.min(max, Number.isFinite(Number(value)) ? Number(value) : min));
}
export function bandAverage(data, start, end) {
  if (!data?.length) return 0;
  const from = Math.max(0, Math.min(data.length - 1, Math.floor(start)));
  const to = Math.max(from + 1, Math.min(data.length, Math.ceil(end)));
  let total = 0;
  for (let i = from; i < to; i++) total += data[i] / 255;
  return total / (to - from);
}

export function frequencyBands(data) {
  const n = data?.length || 0;
  if (!n) return { bass: 0, mids: 0, treble: 0, overall: 0 };
  const bass = bandAverage(data, 0, n * 0.12);
  const mids = bandAverage(data, n * 0.12, n * 0.48);
  const treble = bandAverage(data, n * 0.48, n);
  return { bass, mids, treble, overall: (bass + mids + treble) / 3 };
}

export function normalizeSignal(value, { sensitivity = 1, threshold = 0, smoothing = 0 } = {}) {
  const gated = Math.max(0, clamp(value) - clamp(threshold, 0, 0.95));
  const range = Math.max(0.05, 1 - clamp(threshold, 0, 0.95));
  const shaped = clamp((gated / range) * Math.max(0.1, Number(sensitivity) || 1));
  // Spectrum magnitudes from ordinary speech/music are usually small. A
  // square-root response keeps those real signals visible without making the
  // sensitivity slider excessively aggressive at louder levels.
  return clamp(Math.sqrt(shaped) * (1 - clamp(smoothing, 0, 0.95) * 0.18));
}

export function normalizedPoint(origin, points) {
  if (!Array.isArray(points) || !points.length) return { x: 0, y: 0 };
  const xs = points.map((p) => p[0]);
  const ys = points.map((p) => p[1]);
  const x = Math.min(...xs) + clamp(origin?.[0] ?? 0.5) * (Math.max(...xs) - Math.min(...xs));
  const y = Math.min(...ys) + clamp(origin?.[1] ?? 0.5) * (Math.max(...ys) - Math.min(...ys));
  return { x, y };
}

export function audioSettings(options = {}) {
  return {
    enabled: options.enabled === true,
    band: AUDIO_BANDS.includes(options.band) ? options.band : 'overall',
    sensitivity: clamp(options.sensitivity ?? 1, 0.1, 3),
    amplifier: clamp(options.amplifier ?? 1, 0.25, 4),
    smoothing: clamp(options.smoothing ?? 0.35, 0, 0.95),
    threshold: clamp(options.threshold ?? 0.03, 0, 0.95),
    origin: [clamp(options.origin?.[0] ?? 0.5), clamp(options.origin?.[1] ?? 0.5)],
    rippleRate: clamp(options.rippleRate ?? 1, 0.25, 3),
    rippleDecay: clamp(options.rippleDecay ?? 0.72, 0.2, 0.98),
    rippleStyle: options.rippleStyle === 'water' ? 'water' : 'rings',
  };
}

// A soft approximation of a top-down water wave: several closely spaced,
// blurred bands follow the same expanding wavefront instead of reading as
// separate hard-edged concentric circles.
export function drawWaterWave(ctx, x, y, radius, scaleY, strength, color, maxRadius) {
  const width = Math.max(12, Math.min(maxRadius * 0.24, 46));
  ctx.save();
  ctx.strokeStyle = color;
  ctx.shadowColor = color;
  ctx.shadowBlur = Math.max(8, width * 0.8);
  ctx.lineCap = 'round';
  for (let i = -8; i <= 8; i++) {
    const offset = (i / 8) * width;
    const distance = radius + offset;
    if (distance <= 1) continue;
    const envelope = Math.max(0, 1 - Math.abs(offset) / width);
    const sineBand = 0.35 + 0.65 * Math.pow(Math.sin((i + 8) / 16 * Math.PI), 2);
    ctx.globalAlpha = strength * envelope * sineBand * 0.16;
    ctx.lineWidth = Math.max(1, width * 0.12 * (0.7 + envelope));
    ctx.beginPath();
    ctx.ellipse(x, y, distance, distance * scaleY, 0, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.restore();
}

export class AudioReactiveController {
  constructor() {
    this.audioContext = null;
    this.analyser = null;
    this.sources = [];
    this.streams = [];
    this.data = null;
    this.levels = { bass: 0, mids: 0, treble: 0, overall: 0 };
    this.status = 'idle';
    this.error = '';
  }

  async start(mode = 'microphone') {
    await this.stop();
    if (!navigator.mediaDevices) throw new Error('Audio capture is unavailable in this environment.');
    this.status = 'starting';
    try {
      const streams = [];
      if (mode === 'microphone' || mode === 'mix') {
        streams.push(await navigator.mediaDevices.getUserMedia({ audio: true, video: false }));
      }
      if (mode === 'system' || mode === 'mix') {
        if (!navigator.mediaDevices.getDisplayMedia) throw new Error('System audio capture is unavailable.');
        const display = await navigator.mediaDevices.getDisplayMedia({ audio: true, video: true });
        display.getVideoTracks().forEach((track) => track.stop());
        if (!display.getAudioTracks().length) {
          display.getTracks().forEach((track) => track.stop());
          throw new Error('The selected display did not provide an audio track.');
        }
        streams.push(display);
      }
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      if (!AudioContextClass) throw new Error('Web Audio is unavailable in this environment.');
      this.audioContext = new AudioContextClass();
      this.analyser = this.audioContext.createAnalyser();
      this.analyser.fftSize = 1024;
      this.analyser.smoothingTimeConstant = 0.72;
      this.data = new Uint8Array(this.analyser.frequencyBinCount);
      for (const stream of streams) {
        const source = this.audioContext.createMediaStreamSource(stream);
        source.connect(this.analyser);
        this.sources.push(source);
        this.streams.push(stream);
      }
      await this.audioContext.resume();
      this.status = 'live';
      this.error = '';
    } catch (error) {
      await this.stop();
      this.status = 'error';
      this.error = error?.message || 'Audio capture failed.';
      throw error;
    }
  }

  sample() {
    if (!this.analyser || !this.data || this.status !== 'live') return this.levels;
    this.analyser.getByteFrequencyData(this.data);
    const next = frequencyBands(this.data);
    for (const band of Object.keys(this.levels)) this.levels[band] += (next[band] - this.levels[band]) * 0.22;
    return this.levels;
  }

  async stop() {
    this.sources.forEach((source) => source.disconnect());
    this.streams.forEach((stream) => stream.getTracks().forEach((track) => track.stop()));
    this.sources = [];
    this.streams = [];
    if (this.audioContext) await this.audioContext.close().catch(() => {});
    this.audioContext = null;
    this.analyser = null;
    this.data = null;
    this.levels = { bass: 0, mids: 0, treble: 0, overall: 0 };
    if (this.status !== 'error') this.status = 'idle';
  }
}

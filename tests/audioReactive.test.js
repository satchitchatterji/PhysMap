import test from 'node:test';
import assert from 'node:assert/strict';
import {
  audioSettings,
  frequencyBands,
  normalizeSignal,
  normalizedPoint,
} from '../src/audioReactive.js';

test('frequency bins are grouped into bass, mids, treble and overall levels', () => {
  const data = new Uint8Array(10);
  data.fill(255, 0, 2);
  data.fill(128, 2, 6);
  data.fill(64, 6);
  const bands = frequencyBands(data);
  assert.ok(bands.bass > bands.mids);
  assert.ok(bands.mids > bands.treble);
  assert.equal(bands.overall, (bands.bass + bands.mids + bands.treble) / 3);
});

test('signal normalization applies threshold and sensitivity within bounds', () => {
  assert.equal(normalizeSignal(0.1, { threshold: 0.2 }), 0);
  assert.equal(normalizeSignal(1, { threshold: 0, sensitivity: 3 }), 1);
  assert.ok(normalizeSignal(0.7, { threshold: 0.2, sensitivity: 1 }) > 0);
});

test('audio settings and ripple origins are backward-compatible and bounded', () => {
  const settings = audioSettings({ enabled: true, band: 'invalid', origin: [-2, 4] });
  assert.equal(settings.band, 'overall');
  assert.deepEqual(settings.origin, [0, 1]);
  assert.equal(audioSettings({ rippleStyle: 'water' }).rippleStyle, 'water');
  assert.equal(audioSettings({ rippleStyle: 'unknown' }).rippleStyle, 'rings');
  assert.deepEqual(normalizedPoint([0.25, 0.75], [[10, 20], [110, 80]]), { x: 35, y: 65 });
  assert.equal(audioSettings().enabled, false);
  assert.deepEqual(audioSettings().origin, [0.5, 0.5]);
});

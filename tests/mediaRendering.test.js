import test from 'node:test';
import assert from 'node:assert/strict';
import { drawShapes, makeShape } from '../src/shapes.js';
import { drawPhysicsEffects, effectDefaults } from '../src/physicsEffects.js';

test('image fills use the image even when a video is also assigned', () => {
  const image = { complete: true }, video = { readyState: 4 };
  const shape = makeShape({ points: [[0,0],[20,0],[20,20]], fill: 'image' });
  shape._img = image; shape._video = video;
  const drawn = [];
  const ctx = {
    save() {}, restore() {}, beginPath() {}, moveTo() {}, lineTo() {}, closePath() {}, clip() {},
    drawImage(media) { drawn.push(media); },
  };
  drawShapes(ctx, { shapes: [shape] }, false, 0);
  assert.deepEqual(drawn, [image]);
  shape.fill = 'video';
  drawShapes(ctx, { shapes: [shape] }, false, 0);
  assert.deepEqual(drawn, [image, video]);
});

test('audio-reactive ripples clip to the selected shape only', () => {
  const shape = makeShape({
    points: [[0, 0], [40, 0], [40, 40]],
    fill: 'solid',
    audio: { enabled: true, threshold: 0, origin: [0.5, 0.5] },
  });
  let clips = 0;
  let ellipses = 0;
  const ctx = {
    save() {}, restore() {}, beginPath() {}, moveTo() {}, lineTo() {}, closePath() {}, clip() { clips++; },
    fill() {}, stroke() {}, arc() {}, ellipse() { ellipses++; },
    setLineDash() {},
  };
  drawShapes(ctx, { shapes: [shape], audioLevels: { overall: 1 } }, false, 100);
  drawShapes(ctx, { shapes: [shape], audioLevels: { overall: 1 } }, false, 200);
  assert.ok(clips >= 1);
  assert.ok(ellipses > 0);
});

test('standalone ripple points emit outward audio bursts', () => {
  const point = { ...effectDefaults('ripplePoint', { x: 20, y: 20 }), id: 1 };
  let arcs = 0;
  const ctx = {
    save() {}, restore() {}, beginPath() {}, arc() { arcs++; }, stroke() {}, fill() {},
  };
  drawPhysicsEffects(ctx, [point], 100, false, null, { overall: 1 });
  drawPhysicsEffects(ctx, [point], 200, false, null, { overall: 1 });
  assert.ok(arcs >= 2);
});

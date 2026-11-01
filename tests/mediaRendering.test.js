import test from 'node:test';
import assert from 'node:assert/strict';
import { drawShapes, makeShape } from '../src/shapes.js';

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

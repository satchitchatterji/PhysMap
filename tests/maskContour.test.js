import test from 'node:test';
import assert from 'node:assert/strict';
import { maskContour } from '../src/maskContour.js';

test('keeps the clicked component, omits holes and simplifies a rectangle', () => {
  const mask = new Uint8Array(400);
  for (let y = 3; y < 17; y++) for (let x = 2; x < 16; x++) mask[y * 20 + x] = 1;
  mask[10 * 20 + 10] = 0;
  mask[0] = 1;
  const points = maskContour(mask, 20, 20, [4, 5]);
  assert.equal(points.length, 4);
  assert.deepEqual(new Set(points.map(String)), new Set(['2,3', '16,3', '16,17', '2,17']));
});

test('rejects a background or out-of-bounds prompt', () => {
  assert.throws(() => maskContour(new Uint8Array(4), 2, 2, [0, 0]), /No mask/);
  assert.throws(() => maskContour(new Uint8Array(4), 2, 2, [2, 0]), /No mask/);
});

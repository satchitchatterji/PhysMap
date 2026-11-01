import test from 'node:test';
import assert from 'node:assert/strict';
import { makeShape } from '../src/shapes.js';
import { clampOpacity, reorderShape } from '../src/layers.js';

function shapes() {
  return [{ id: 'a' }, { id: 'b' }, { id: 'c' }];
}

test('reorders one step forward and backward in bottom-to-top order', () => {
  const items = shapes();
  assert.equal(reorderShape(items, 'a', 'forward'), true);
  assert.deepEqual(items.map(({ id }) => id), ['b', 'a', 'c']);
  assert.equal(reorderShape(items, 'c', 'backward'), true);
  assert.deepEqual(items.map(({ id }) => id), ['b', 'c', 'a']);
});

test('moves a shape to the front or back', () => {
  const items = shapes();
  assert.equal(reorderShape(items, 'a', 'front'), true);
  assert.deepEqual(items.map(({ id }) => id), ['b', 'c', 'a']);
  assert.equal(reorderShape(items, 'c', 'back'), true);
  assert.deepEqual(items.map(({ id }) => id), ['c', 'b', 'a']);
});

test('returns false for unknown ids, invalid actions and boundary no-ops', () => {
  const items = shapes();
  assert.equal(reorderShape(items, 'missing', 'front'), false);
  assert.equal(reorderShape(items, 'a', 'back'), false);
  assert.equal(reorderShape(items, 'c', 'front'), false);
  assert.equal(reorderShape(items, 'b', 'sideways'), false);
  assert.deepEqual(items.map(({ id }) => id), ['a', 'b', 'c']);
});

test('clamps finite opacity and defaults missing or non-finite values to one', () => {
  assert.equal(clampOpacity(undefined), 1);
  assert.equal(clampOpacity(null), 1);
  assert.equal(clampOpacity(Number.NaN), 1);
  assert.equal(clampOpacity(Infinity), 1);
  assert.equal(clampOpacity(-0.4), 0);
  assert.equal(clampOpacity(0), 0);
  assert.equal(clampOpacity(0.35), 0.35);
  assert.equal(clampOpacity(1.4), 1);
});

test('makeShape stores a clamped opacity and defaults it to one', () => {
  const base = { points: [[0, 0], [10, 0], [10, 10]] };
  assert.equal(makeShape(base).opacity, 1);
  assert.equal(makeShape({ ...base, opacity: 0.4 }).opacity, 0.4);
  assert.equal(makeShape({ ...base, opacity: -1 }).opacity, 0);
  assert.equal(makeShape({ ...base, opacity: 4 }).opacity, 1);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { splitPathEdge } from '../src/pathEditing.js';

test('inserts a straight open-path midpoint without changing other curve slots', () => {
  const result = splitPathEdge(
    [[0, 0], [10, 0], [20, 0]],
    [null, [15, 5]],
    false,
    0,
  );

  assert.deepEqual(result, {
    points: [[0, 0], [5, 0], [10, 0], [20, 0]],
    curves: [null, null, [15, 5]],
    vertexIndex: 1,
  });
});

test('splits a quadratic edge exactly at t=0.5', () => {
  const result = splitPathEdge([[0, 0], [10, 0]], [[5, 10]], false, 0);
  assert.deepEqual(result, {
    points: [[0, 0], [5, 5], [10, 0]],
    curves: [[2.5, 5], [7.5, 5]],
    vertexIndex: 1,
  });
});

test('splits a closed path closing edge at the end and preserves curve alignment', () => {
  const result = splitPathEdge(
    [[0, 0], [10, 0], [10, 10]],
    [[2, 0], null, [0, 4]],
    true,
    2,
  );

  assert.deepEqual(result, {
    points: [[0, 0], [10, 0], [10, 10], [2.5, 4.5]],
    curves: [[2, 0], null, [5, 7], [0, 2]],
    vertexIndex: 3,
  });
});

test('rejects missing and out-of-range edges', () => {
  assert.throws(() => splitPathEdge([[0, 0]], [], false, 0), /at least two points/);
  assert.throws(() => splitPathEdge([[0, 0], [1, 1]], [], false, 1), /outside the path/);
});

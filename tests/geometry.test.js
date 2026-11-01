import test from 'node:test';
import assert from 'node:assert/strict';
import { previewPoint, projectPoint, solveHomography } from '../src/geometry.js';

const closePoint = (actual, expected, epsilon = 1e-8) => {
  assert.ok(Math.abs(actual[0] - expected[0]) < epsilon, `${actual[0]} != ${expected[0]}`);
  assert.ok(Math.abs(actual[1] - expected[1]) < epsilon, `${actual[1]} != ${expected[1]}`);
};

test('solveHomography maps identity correspondences', () => {
  const quad = [[0, 0], [1, 0], [1, 1], [0, 1]];
  const matrix = solveHomography(quad, quad);
  assert.equal(matrix.length, 9);
  for (const point of quad) closePoint(projectPoint(matrix, point), point);
});

test('solveHomography maps a perspective quad', () => {
  const from = [[0, 0], [1, 0], [1, 1], [0, 1]];
  const to = [[2, 3], [8, 2], [7, 9], [1, 6]];
  const matrix = solveHomography(from, to);
  from.forEach((point, index) => closePoint(projectPoint(matrix, point), to[index]));
  const interior = projectPoint(matrix, [0.5, 0.5]);
  assert.ok(interior.every(Number.isFinite));
});

test('solveHomography rejects degenerate correspondences', () => {
  const line = [[0, 0], [1, 0], [2, 0], [3, 0]];
  assert.throws(() => solveHomography(line, line), /Degenerate homography/);
});

test('projectPoint rejects points on the projective horizon', () => {
  assert.throws(() => projectPoint([1, 0, 0, 0, 1, 0, 1, 0, 0], [0, 1]), /infinity/);
});

test('previewPoint maps contain-fitted clicks to intrinsic pixels and ignores letterboxes', () => {
  const rect = { left: 10, top: 20, width: 200, height: 200 };
  assert.deepEqual(previewPoint(110, 120, rect, 400, 200), [200, 100]);
  assert.deepEqual(previewPoint(10, 70, rect, 400, 200), [0, 0]);
  assert.equal(previewPoint(110, 40, rect, 400, 200), null);
});

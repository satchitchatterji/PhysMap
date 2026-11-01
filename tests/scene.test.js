import test from 'node:test';
import assert from 'node:assert/strict';
import { serialize, applyScene } from '../src/scene.js';
import { makeShape } from '../src/shapes.js';

function fixture() {
  return {
    shapes: [], emitters: [], effects: [], drawings: [], cameraCalibration: null,
    clearEmitters() { this.emitters = []; },
    setShapes(shapes) { this.shapes = shapes.map(makeShape); },
    getViewport: () => ({ width: 800, height: 600 }),
  };
}

test('scene stores video references and authored geometry without runtime media', () => {
  const app = fixture();
  app.shapes.push(makeShape({ points: [[0, 0], [20, 0], [20, 20]], video: { kind: 'file', path: '/tmp/clip.mp4', name: 'clip.mp4' } }));
  app.shapes[0]._video = { runtime: true };
  const saved = serialize(app);
  assert.equal(saved.version, 3);
  assert.equal(saved.shapes[0].video.path, '/tmp/clip.mp4');
  assert.equal('_video' in saved.shapes[0], false);
  assert.equal('youtube' in saved.shapes[0], false);
});

test('legacy YouTube surfaces become outlines and notify once per scene load', () => {
  const app = fixture();
  const points = [[0, 0], [20, 0], [20, 20]];
  let notices = 0;
  applyScene({ obstacles: [], shapes: [1, 2].map(() => ({ points, fill: 'youtube', youtube: 'old-id' })) }, app, () => notices++);
  assert.equal(notices, 1);
  assert.deepEqual(app.shapes[0].points, points);
  assert.equal(app.shapes[0].fill, 'outline');
  assert.equal(app.cameraCalibration, null);
});

test('calibration persists normalized pairs and reconstructs its matrix', () => {
  const app = fixture();
  const points = [[0, 0], [1, 0], [1, 1], [0, 1]];
  app.cameraCalibration = { cameraPoints: points, workspacePoints: points, frameWidth: 640, frameHeight: 480, matrix: [] };
  const saved = serialize(app);
  assert.equal('matrix' in saved.cameraCalibration, false);
  applyScene(saved, app);
  assert.deepEqual(app.cameraCalibration.matrix, [1, 0, 0, 0, 1, 0, 0, 0, 1]);
  applyScene({ ...saved, cameraCalibration: { cameraPoints: [], workspacePoints: [] } }, app);
  assert.equal(app.cameraCalibration, null);
});

test('layer order and zero opacity survive scene round-trip', () => {
  const app = fixture();
  const points = [[0,0],[10,0],[10,10]];
  app.shapes = [makeShape({points, name:'Back', opacity:0}), makeShape({points, name:'Front', opacity:0.4})];
  applyScene(serialize(app), app);
  assert.deepEqual(app.shapes.map(shape => shape.name), ['Back', 'Front']);
  assert.deepEqual(app.shapes.map(shape => shape.opacity), [0, 0.4]);
});

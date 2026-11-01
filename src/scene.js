// scene.js
// ---------------------------------------------------------------------------
// Save / load the *setup* of a scene: the user-drawn obstacles and the emitter
// configuration. Dynamic circles are transient and never serialized.
//
// Three persistence routes share one JSON shape:
//   - localStorage  (quick autosave / restore between sessions)
//   - export file   (download a .json you can commit or share)
//   - import file   (load a .json back)
//
// JSON shape:
//   {
//     "version": 1,
//     "obstacles": [ {type:'wall',x1,y1,x2,y2}, {type:'rect',x,y,w,h}, ... ],
//     "emitters":  [ {x, y, interval}, ... ],
//     "drawings":  [ {points:[[x,y],...], color, size}, ... ],
//     "viewport":  {width, height},
//     "visualMode": "physics" | "eyes" | ...,
//     "eyeStyle": "round" | "hollow" | ...
//   }

import { config } from './config.js';
import { solveHomography } from './geometry.js';
import {
  allBodies,
  clearObstacles,
  clearDynamic,
  createWall,
  createRectangle,
} from './physics.js';

// Build the plain-object snapshot from current world + app state.
export function serialize(app) {
  const obstacles = allBodies()
    .filter((b) => {
      return b.label === 'obstacle' && b.physmap && !['floor', 'draw'].includes(b.physmap.type);
    })
    .map((b) => ({ ...b.physmap }));

  const emitters = app.emitters.map((e) => ({
    name: e.name || '',
    visible: e.visible !== false,
    locked: e.locked === true,
    x: e.x,
    y: e.y,
    interval: e.interval,
    angle: e.angle,
    power: e.power,
    kind: e.kind || 'orb',
    count: e.count || 1,
    spread: e.spread || 0,
  }));

  const effects = (app.effects || []).map((effect) => {
    const { id, ...data } = effect;
    return data;
  });

  const drawings = (app.drawings || []).map((d) => ({
    points: d.points.map((p) => [p[0], p[1]]),
    color: d.color,
    size: d.size,
  }));

  // Drawable shape objects (the reformed core). Body handles are transient and
  // rebuilt on load, so we only persist the authored geometry + look.
  const shapes = (app.shapes || []).map((s) => ({
    name: s.name || '',
    visible: s.visible !== false,
    locked: s.locked === true,
    opacity: s.opacity ?? 1,
    type: s.type,
    points: s.points.map((p) => [p[0], p[1]]),
    closed: s.closed,
    curves: Array.isArray(s.curves) ? s.curves.map((c) => (c ? [c[0], c[1]] : null)) : [],
    role: s.role,
    fill: s.fill,
    anim: s.anim,
    animSpeed: s.animSpeed,
    animIntensity: s.animIntensity,
    quickLook: s.quickLook || '',
    color: s.color,
    strokeWidth: s.strokeWidth,
    outlineFx: s.outlineFx,
    outlineSpeed: s.outlineSpeed,
    audio: s.audio ? {
      enabled: s.audio.enabled === true,
      band: s.audio.band,
      sensitivity: s.audio.sensitivity,
      smoothing: s.audio.smoothing,
      threshold: s.audio.threshold,
      origin: Array.isArray(s.audio.origin) ? [...s.audio.origin] : [0.5, 0.5],
      rippleRate: s.audio.rippleRate,
      rippleDecay: s.audio.rippleDecay,
    } : undefined,
    image: s.image || null,
    video: s.video || null,
  }));

  const viewport = app.getViewport ? app.getViewport() : null;

  return {
    version: 3,
    obstacles,
    emitters,
    drawings,
    shapes,
    effects,
    viewport,
    cameraCalibration: app.cameraCalibration ? {
      cameraPoints: app.cameraCalibration.cameraPoints.map(p => [...p]),
      workspacePoints: app.cameraCalibration.workspacePoints.map(p => [...p]),
      cameraId: app.cameraCalibration.cameraId || '',
      frameWidth: app.cameraCalibration.frameWidth,
      frameHeight: app.cameraCalibration.frameHeight,
    } : null,
    visualMode: app.visualMode,
    eyeStyle: app.eyeStyle,
  };
}

// Rebuild the world from a snapshot. Clears existing obstacles + circles first.
// `app.addEmitter` is used so emitters get consistent ids/state.
export function applyScene(data, app, onLegacyYoutube = null) {
  if (!data || !Array.isArray(data.obstacles)) {
    throw new Error('Invalid scene data');
  }
  clearDynamic();
  app.cameraCalibration = null;
  if (data.cameraCalibration) {
    try {
      const saved = data.cameraCalibration;
      const matrix = solveHomography(saved.cameraPoints, saved.workspacePoints);
      if (saved.frameWidth > 0 && saved.frameHeight > 0) {
        app.cameraCalibration = { ...saved, matrix };
      }
    } catch { /* An invalid saved calibration can be replaced in Camera Setup. */ }
  }
  clearObstacles();
  app.clearEmitters();

  for (const o of data.obstacles) {
    if (o.type === 'wall') {
      createWall(o.x1, o.y1, o.x2, o.y2);
    } else if (o.type === 'rect') {
      createRectangle(o.x, o.y, o.w, o.h);
    }
  }

  if (Array.isArray(data.emitters)) {
    for (const e of data.emitters) {
      app.addEmitter(e.x, e.y, e.interval, e.angle, e.power, e.kind, e);
    }
  }

  if (app.setEffects) {
    app.setEffects(data.effects, data.viewport);
  }

  if (app.setDrawings) {
    app.setDrawings(data.drawings);
  }

  if (app.setShapes) {
    let migratedYoutube = false;
    const shapes = (data.shapes || []).map((shape) => {
      if (shape.fill !== 'youtube' && !shape.youtube) return shape;
      migratedYoutube = true;
      const normalized = { ...shape };
      if (normalized.fill === 'youtube') normalized.fill = 'outline';
      delete normalized.youtube;
      return normalized;
    });
    app.setShapes(shapes);
    if (migratedYoutube && typeof onLegacyYoutube === 'function') onLegacyYoutube();
  }

  if (typeof data.visualMode === 'string' && config.visualModes.includes(data.visualMode)) {
    app.visualMode = data.visualMode;
  } else {
    app.visualMode = config.visualMode;
  }

  if (typeof data.eyeStyle === 'string' && config.eyeStyles.includes(data.eyeStyle)) {
    app.eyeStyle = data.eyeStyle;
  } else {
    app.eyeStyle = config.eyeStyle;
  }
}

// --- localStorage -----------------------------------------------------------

export function saveLocal(app) {
  try {
    localStorage.setItem(
      config.storageKey,
      JSON.stringify({ ...serialize(app), savedAt: Date.now() }),
    );
  } catch (err) {
    // Big embedded media (a video dataURL) can blow the ~5MB localStorage
    // quota. Don't let autosave crash the app — the scene still works in
    // memory and can be saved to a file via Export.
    console.warn('PhysMap: scene autosave skipped (storage full?) —', err);
  }
}

export function getLocalScene() {
  const raw = localStorage.getItem(config.storageKey);
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

// Returns true if a saved scene was found and applied.
export function loadLocal(app, onLegacyYoutube) {
  const data = getLocalScene();
  if (!data) return false;
  try {
    applyScene(data, app, onLegacyYoutube);
    return true;
  } catch (err) {
    console.warn('PhysMap: failed to load saved scene —', err);
    return false;
  }
}

// --- Named saves (a little library of scenes kept in the browser) -----------

const SAVES_KEY = 'physmap-saves';

// Returns a map of { name: snapshot }. Snapshots include a `savedAt` timestamp.
export function listSaves() {
  try {
    return JSON.parse(localStorage.getItem(SAVES_KEY)) || {};
  } catch {
    return {};
  }
}

function writeSaves(obj) {
  try {
    localStorage.setItem(SAVES_KEY, JSON.stringify(obj));
    return true;
  } catch (err) {
    console.warn('PhysMap: could not write saves (storage full?) —', err);
    return false;
  }
}

// Save the current scene under `name` (overwrites an existing one).
export function saveNamed(app, name) {
  const all = listSaves();
  all[name] = { ...serialize(app), savedAt: Date.now() };
  return writeSaves(all);
}

// Load a named scene into the app. Returns true if it existed.
export function loadNamed(app, name, onLegacyYoutube) {
  const all = listSaves();
  if (!all[name]) return false;
  applyScene(all[name], app, onLegacyYoutube);
  return true;
}

// Delete a named scene. Returns true if it existed.
export function deleteNamed(name) {
  const all = listSaves();
  if (!(name in all)) return false;
  delete all[name];
  return writeSaves(all);
}

// --- File export / import ---------------------------------------------------

export function exportFile(app) {
  const blob = new Blob([JSON.stringify(serialize(app), null, 2)], {
    type: 'application/json',
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'physmap-scene.json';
  a.click();
  URL.revokeObjectURL(url);
}

// Read a File object (from an <input type="file">) and apply it.
export function importFile(file, app, onLegacyYoutube) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        applyScene(JSON.parse(reader.result), app, onLegacyYoutube);
        resolve();
      } catch (err) {
        reject(err);
      }
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsText(file);
  });
}

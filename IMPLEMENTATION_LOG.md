# Implementation plan

- [x] Youtube removal
- [x] Disk-stream videos
- [x] Midpoint insertion
- [ ] Camera alignment
- [ ] SlimSAM masks
- [ ] Ordered layers

## Step 1: Youtube removal

- Removed the YouTube iframe module, its render-loop integration, inspector
  controls, and README references.
- Scene serialization no longer stores YouTube IDs. When old scenes load, a
  `youtube` fill becomes `outline`; shape points and curves are preserved, and
  one flash notice reports the migration.
- Added `src/geometry.js` with `solveHomography(from, to)` and
  `projectPoint(matrix, point)` for the camera-alignment work. Invalid and
  singular inputs are rejected.
- Verification: 4 geometry tests, changed-JavaScript syntax checks, and diff whitespace checks passed. Build deferred until dependency installation completes (Vite initially unavailable).
- Limitations: none known for this step.
- Intended commit: `Remove YouTube embeds and extract homography helpers`

## Step 2: Disk-stream videos

- Native file picking and token-based `physmap-media` streaming support GET/HEAD,
  byte ranges, seeking, and relinking. Scene version 3 stores `{kind: 'file', path,
  name}` rather than bytes. Browser files use session handles/object URLs;
  legacy embedded videos still load. Play/pause and a seek slider are available.
- Media elements and object URLs are released on replacement/deletion. Browser
  File references remain session-local so undo can restore them without copying bytes.
- Verification: 4 byte-range/protocol tests passed, renderer/backend syntax checks
  passed, and production build passed using Vite directly while npm finishes setup.
  Step 1 also passes that build.
- Limitations: real multi-GB playback/memory and packaged Electron checks require
  a representative video and interactive desktop verification. Browser reopening
  requires reselection; external videos are not bundled in scene exports.
- Intended commit: `Stream local videos from disk and add playback controls`

## Step 3: Midpoint insertion

- Every selected unlocked line edge retains a visible midpoint, including the
  closing edge. Dragging inserts a vertex; Alt/Option keeps curve bending.
- Quadratics split exactly with de Casteljau before the new vertex moves. Each
  gesture checkpoints once. Rectangle/triangle behavior stays unchanged.
- Verification: 4 open/closed/curved path tests and production build passed.
- Limitations: real pointer/undo verification remains in the final browser pass.
- Intended commit: `Insert editable line vertices from persistent midpoints`

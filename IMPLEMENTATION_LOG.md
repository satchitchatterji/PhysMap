# Implementation plan

- [x] Youtube removal
- [x] Disk-stream videos
- [x] Midpoint insertion
- [x] Camera alignment
- [x] SlimSAM masks
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

## Step 4: Camera alignment

- Added Camera setup with live preview, device choice, freeze/retake/start/stop,
  and four camera clicks matching numbered projector targets. Targets appear
  before capture. The panel never enters the clean projection stream.
- Calibration saves normalized correspondences/dimensions/device ID, reconstructs
  its matrix on load, and can be explicitly reused on matching camera frames.
- Camera requests are video-only and restricted to the editor; packaged macOS
  declares its camera usage. Closing stops tracks; stale permission requests and
  disconnected cameras are handled. Segmentation receives frozen frames via a hook.
- Verification: 5 geometry/letterbox tests, 3 scene migration/persistence tests,
  syntax checks, production build, and whitespace checks passed.
- Limitations: physical camera/projector alignment and packaged macOS permission
  prompts require hardware verification. One plane is supported per scene.
- Intended commit: `Add camera capture and persistent four-point calibration`

## Step 5: SlimSAM masks

- Lazy-loaded Transformers.js 3.8.1 and quantized SlimSAM run in a worker. Runtime
  WASM assets are bundled; model weights download once into browser cache. The
  library is a dev dependency so its Node/native packages are excluded from installers.
- Foreground/background prompts reuse frame embeddings and preprocessing sizes.
  Highest-score previews become simplified outer contours of the clicked component;
  accepting maps vertices into a normal editable line surface in one undo action.
- Reset/retry/close invalidate stale results. Camera capture stops before mask editing;
  worker termination and buffer cleanup release transient inference state.
- Verification: production build passes including local WASM assets; contour tests
  pass. Browser synthetic-frame check completed model loading, foreground and
  background inference, and acceptance of a 13-vertex outline. A repeatable manual
  check lives at `/tests/segmentation-smoke.html` under the dev server.
- Limitations: model cache eviction requires a fresh download; offline packaged
  behavior and mask quality on real objects need field verification. Holes are omitted.
- Intended commit: `Generate editable camera masks with on-demand SlimSAM`

# Implementation plan

- [x] Youtube removal
- [x] Disk-stream videos
- [x] Midpoint insertion
- [x] Camera alignment
- [x] SlimSAM masks
- [x] Ordered layers

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

## Step 6: Ordered surface layers

- Surface order uses the existing bottom-to-top shape array, with front/back and
  single-step controls available in Properties and Layers. Layer selection stays
  in Layers. Each surface has saved opacity, including fully transparent surfaces.
- Translucent surfaces composite as a group through a shared scratch canvas, so
  overlapping strokes/fills do not multiply opacity. Global Cut masks retain their
  final render pass, and hit testing follows the same mask-first priority.
- Visibility, lock, duplicate, independent image/video content and undo are retained.
- Verification: ordering/clamp/default tests and scene order/zero-opacity round-trip
  tests pass. Browser checks confirmed opacity changes and duplication; final
  ordering/undo/reload checks follow. Production build passes.
- Limitations: multiple high-resolution decoders and Canvas2D perspective warps
  remain hardware-dependent; no custom native renderer was introduced.
- Intended commit: `Add surface stacking controls and whole-surface opacity`

## Final integration verification and fixes

- Browser UI verified saved opacity after reload, layer selection staying in Layers,
  Send to Back ordering and Undo restoration. A closed line midpoint drag produced
  a new vertex with fresh midpoint handles on both resulting edges.
- Fixed image fills accidentally preferring a retained video decoder, and release
  decoders when changing to non-video content. Reuse file tokens across scene undo
  restores. Grow the shared opacity buffer instead of reallocating it as editor and
  projector backing sizes alternate. Layer order buttons use two readable columns.
- Added a media rendering regression test; `npm test` now passes 25 tests.
- Documented operation, file references, model caching and hardware limitations in
  README. No framework, custom native module, or network inference service was added.
- Intended commit: `Polish media lifecycle and document verified projection workflow`

## Remaining field checks

- [ ] Multi-GB supported video: seek near end, loop, relink, reopen, and inspect
  memory to confirm it stays independent of file size.
- [ ] Packaged macOS: allow/deny camera, switch/disconnect device, close setup and
  verify the camera indicator turns off.
- [ ] Physical projector: verify four targets and accepted contours align on one
  plane, with no editor/camera/mask UI in clean output.
- [ ] Packaged app offline after model caching: generate and refine a mask.

These need representative media/hardware or a packaged desktop session; they are
not claimed as completed by automated tests or the synthetic-frame browser check.

## Desktop runtime setup

- npm dependencies and the pinned ML dependency are installed; build/tests pass.
  Electron's separate binary download was attempted, but transferred under 1 MB
  in several minutes. It was stopped rather than leaving a long-running installer.
- Desktop launch/package verification remains pending. On a normal connection,
  run `npm rebuild electron`, then `npm run desktop` (or `npm run pack`).
- Browser development is available now with `npm run dev`. No installers were
  published and no remote repository changes were pushed.

## Electron download completed

- Installed Electron 41.7.1 for macOS arm64. GitHub release downloads stalled;
  the fallback mirror completed using parallel HTTP/1.1 range requests.
- Reassembled ZIP size: 116,319,822 bytes. SHA-256 matches the checksum bundled
  with the pinned Electron npm package:
  `a092f0c1aa722037fa07d3256d5bf4aef2833d990bf4d09fe907d588c35b341d`.
- ZIP integrity passed. Native macOS extraction completed the installation after
  the JavaScript extractor exited early. The executable reports `v41.7.1` outside
  the command sandbox; `require('electron')` resolves to the installed executable.
- `npm rebuild electron` completes successfully. `npm run desktop` builds and
  starts the Electron app. The earlier runtime-download blocker is resolved;
  the remaining physical camera/projector/media checks still apply.
- Intended commit: `Record verified Electron runtime installation`

## Step 7: Audio-reactive mapped surfaces

- Added a dependency-free Web Audio controller with microphone, system-audio, and
  mixed capture modes, analyser band levels, smoothing, thresholds, sensitivity,
  and cleanup of all acquired tracks. Temporary system-capture video tracks are
  stopped after the audio track is obtained.
- Shapes now persist opt-in audio settings and a normalized ripple origin. Enabled
  surfaces modulate animated-fill speed/brightness and draw clipped audio ripples
  from the origin; existing scenes remain disabled by default. The editor exposes
  AUDIO capture controls and per-shape Motion controls, including a draggable origin.
- Electron media permission handling now permits editor audio while retaining
  camera permission checks for video capture. System-audio availability remains
  platform/share-source dependent.
- Verification: `npm test` passed 30 tests; `npm run build` passed with Vite.
  Added signal, normalization, persistence, and clipping regression tests.
- Limitations: microphone/system permission prompts and real system-audio mixing
  require interactive desktop verification on each target OS; no hardware capture
  check was claimed here.
- Intended commit: `Add audio-reactive surface ripples and animation modulation`

## Audio permission follow-up

- Added the macOS `NSMicrophoneUsageDescription` application declaration. Without
  it, Electron can reject microphone capture before macOS displays a permission
  prompt. A packaged build or fresh Electron launch is required to pick up the
  updated application metadata.
- Verification after this metadata-only fix: run `npm test` and `npm run build`;
  interactive permission prompts still require the user's desktop session.
- Intended commit: `Declare macOS microphone usage for audio capture`

## Audio permission handler correction

- Electron can report the initial media permission check as `unknown` before the
  request includes its concrete audio/video types. The handler now allows that
  check and continues to the existing media-type validation instead of rejecting
  microphone capture before the OS prompt.
- Intended commit: `Allow Electron unknown media checks for audio permission`

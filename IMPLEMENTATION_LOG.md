# Implementation plan

- [x] Youtube removal
- [ ] Disk-stream videos
- [ ] Midpoint insertion
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

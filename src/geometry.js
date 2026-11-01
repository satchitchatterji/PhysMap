// Perspective geometry helpers shared by mapping and camera alignment.

export function solveHomography(from, to) {
  if (!Array.isArray(from) || !Array.isArray(to) || from.length !== 4 || to.length !== 4) {
    throw new TypeError('Homography requires four source and destination points');
  }
  const points = [...from, ...to];
  if (points.some((point) => !Array.isArray(point) || point.length < 2 ||
    !Number.isFinite(point[0]) || !Number.isFinite(point[1]))) {
    throw new TypeError('Homography points must have finite x and y coordinates');
  }

  const rows = [];
  for (let i = 0; i < 4; i += 1) {
    const [x, y] = from[i];
    const [u, v] = to[i];
    rows.push([[x, y, 1, 0, 0, 0, -u * x, -u * y], u]);
    rows.push([[0, 0, 0, x, y, 1, -v * x, -v * y], v]);
  }

  // Gauss-Jordan elimination with partial pivoting. Singular systems occur
  // when either quad is degenerate or the correspondences cannot define a map.
  for (let col = 0; col < 8; col += 1) {
    let pivot = col;
    for (let row = col + 1; row < 8; row += 1) {
      if (Math.abs(rows[row][0][col]) > Math.abs(rows[pivot][0][col])) pivot = row;
    }
    if (Math.abs(rows[pivot][0][col]) < 1e-12) throw new RangeError('Degenerate homography points');
    [rows[col], rows[pivot]] = [rows[pivot], rows[col]];
    const divisor = rows[col][0][col];
    for (let j = col; j < 8; j += 1) rows[col][0][j] /= divisor;
    rows[col][1] /= divisor;
    for (let row = 0; row < 8; row += 1) {
      if (row === col) continue;
      const factor = rows[row][0][col];
      for (let j = col; j < 8; j += 1) rows[row][0][j] -= factor * rows[col][0][j];
      rows[row][1] -= factor * rows[col][1];
    }
  }
  const h = rows.map((row) => row[1]);
  if (h.some((value) => !Number.isFinite(value))) throw new RangeError('Degenerate homography points');
  return [...h, 1];
}

export function projectPoint(matrix, point) {
  const h = Array.isArray(matrix[0]) ? matrix.flat() : matrix;
  if (h.length !== 9 || h.some((value) => !Number.isFinite(value)) ||
    !Array.isArray(point) || !Number.isFinite(point[0]) || !Number.isFinite(point[1])) {
    throw new TypeError('Expected a 3x3 homography and a finite point');
  }
  const [x, y] = point;
  const denominator = h[6] * x + h[7] * y + h[8];
  if (Math.abs(denominator) < 1e-12) throw new RangeError('Point projects to infinity');
  return [
    (h[0] * x + h[1] * y + h[2]) / denominator,
    (h[3] * x + h[4] * y + h[5]) / denominator,
  ];
}

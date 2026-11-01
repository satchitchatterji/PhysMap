// Keep the clicked component and trace its outer pixel boundary. Holes are omitted.
export function maskContour(mask, width, height, seed, tolerance = 2) {
  const sx = Math.floor(seed[0]), sy = Math.floor(seed[1]);
  if (sx < 0 || sy < 0 || sx >= width || sy >= height || !mask[sy * width + sx]) {
    throw new Error('No mask at this point. Add a foreground point inside the object.');
  }
  const seen = new Uint8Array(width * height);
  const queue = new Int32Array(width * height);
  let count = 1;
  queue[0] = sy * width + sx;
  seen[queue[0]] = 1;
  for (let head = 0; head < count; head++) {
    const p = queue[head], x = p % width, y = Math.floor(p / width);
    for (const n of [x ? p - 1 : -1, x + 1 < width ? p + 1 : -1,
      y ? p - width : -1, y + 1 < height ? p + width : -1]) {
      if (n >= 0 && mask[n] && !seen[n]) { seen[n] = 1; queue[count++] = n; }
    }
  }
  const edges = new Map();
  const key = (x, y) => y * (width + 1) + x;
  const add = (x, y, nx, ny) => {
    const k = key(x, y);
    if (!edges.has(k)) edges.set(k, []);
    edges.get(k).push(key(nx, ny));
  };
  for (let i = 0; i < count; i++) {
    const p = queue[i], x = p % width, y = Math.floor(p / width);
    if (!y || !seen[p - width]) add(x, y, x + 1, y);
    if (x + 1 === width || !seen[p + 1]) add(x + 1, y, x + 1, y + 1);
    if (y + 1 === height || !seen[p + width]) add(x + 1, y + 1, x, y + 1);
    if (!x || !seen[p - 1]) add(x, y + 1, x, y);
  }
  const point = k => [k % (width + 1), Math.floor(k / (width + 1))];
  let outer = [], largest = 0;
  while (edges.size) {
    const start = edges.keys().next().value;
    const loop = [];
    let current = start, previous = null;
    do {
      const a = point(current);
      loop.push(a);
      const next = edges.get(current);
      if (!next?.length) throw new Error('Could not trace mask boundary. Try another point.');
      let choice = 0;
      if (previous !== null && next.length > 1) {
        const b = point(previous), dx = a[0] - b[0], dy = a[1] - b[1];
        // Prefer a right turn at a boundary that touches itself at one pixel.
        choice = next.findIndex(k => {
          const c = point(k);
          return dx * (c[1] - a[1]) - dy * (c[0] - a[0]) > 0;
        });
        if (choice < 0) choice = 0;
      }
      const target = next.splice(choice, 1)[0];
      if (!next.length) edges.delete(current);
      previous = current;
      current = target;
    } while (current !== start);
    const area = Math.abs(loop.reduce((sum, a, i) => {
      const b = loop[(i + 1) % loop.length];
      return sum + a[0] * b[1] - b[0] * a[1];
    }, 0));
    if (area > largest) { largest = area; outer = loop; }
  }
  outer = outer.filter((b, i, points) => {
    const a = points[(i + points.length - 1) % points.length], c = points[(i + 1) % points.length];
    return (b[0] - a[0]) * (c[1] - b[1]) !== (b[1] - a[1]) * (c[0] - b[0]);
  });
  if (outer.length < 3) throw new Error('Mask is too small.');
  let far = 1;
  const distance = p => (p[0] - outer[0][0]) ** 2 + (p[1] - outer[0][1]) ** 2;
  for (let i = 2; i < outer.length; i++) if (distance(outer[i]) > distance(outer[far])) far = i;
  const result = [...simplify(outer.slice(0, far + 1), tolerance).slice(0, -1),
    ...simplify([...outer.slice(far), outer[0]], tolerance).slice(0, -1)];
  return result.length >= 3 ? result : outer;
}

function simplify(points, tolerance) {
  const keep = new Set([0, points.length - 1]);
  const stack = [[0, points.length - 1]];
  while (stack.length) {
    const [first, last] = stack.pop();
    const a = points[first], b = points[last], dx = b[0] - a[0], dy = b[1] - a[1];
    const length = dx * dx + dy * dy;
    let best = tolerance * tolerance, index = -1;
    for (let i = first + 1; i < last; i++) {
      const p = points[i];
      const t = length ? Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / length)) : 0;
      const d = (p[0] - a[0] - t * dx) ** 2 + (p[1] - a[1] - t * dy) ** 2;
      if (d > best) { best = d; index = i; }
    }
    if (index >= 0) { keep.add(index); stack.push([first, index], [index, last]); }
  }
  return [...keep].sort((a, b) => a - b).map(i => points[i]);
}

function midpoint(a, b) {
  return [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
}

/**
 * Split one path edge at t=0.5 and return new path arrays plus the inserted
 * vertex index. Quadratic edges are split exactly with de Casteljau.
 */
export function splitPathEdge(points, curves, closed, edgeIndex) {
  if (!Array.isArray(points) || points.length < 2) throw new Error('A path needs at least two points.');
  const edgeCount = closed === false ? points.length - 1 : points.length;
  if (!Number.isInteger(edgeIndex) || edgeIndex < 0 || edgeIndex >= edgeCount) {
    throw new Error('Edge index is outside the path.');
  }

  const nextPoints = points.map((point) => [point[0], point[1]]);
  const nextCurves = Array.from({ length: edgeCount + 1 }, () => null);
  const a = points[edgeIndex];
  const b = points[(edgeIndex + 1) % points.length];
  const control = Array.isArray(curves?.[edgeIndex]) ? curves[edgeIndex] : null;
  let inserted;
  let leftControl = null;
  let rightControl = null;

  if (control) {
    const first = midpoint(a, control);
    const second = midpoint(control, b);
    inserted = midpoint(first, second);
    leftControl = first;
    rightControl = second;
  } else {
    inserted = midpoint(a, b);
  }

  const vertexIndex = edgeIndex + 1;
  nextPoints.splice(vertexIndex, 0, inserted);
  for (let oldEdge = 0; oldEdge < edgeCount; oldEdge++) {
    if (oldEdge === edgeIndex) {
      nextCurves[oldEdge] = leftControl;
      nextCurves[oldEdge + 1] = rightControl;
      continue;
    }
    const newEdge = oldEdge < edgeIndex ? oldEdge : oldEdge + 1;
    const oldControl = curves?.[oldEdge];
    nextCurves[newEdge] = Array.isArray(oldControl) ? [oldControl[0], oldControl[1]] : null;
  }

  return { points: nextPoints, curves: nextCurves, vertexIndex };
}

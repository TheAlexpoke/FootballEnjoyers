// Keep photos readable while their connector lines preserve the exact data point.
export function spreadHistoryMarkers<T extends { id: string; y: number }>(
  points: T[],
  top = 40,
  bottom = 410,
  spacing = 40,
) {
  const sorted = points
    .map((point) => ({ ...point, markerY: point.y }))
    .sort((a, b) => a.y - b.y);
  for (let i = 0; i < sorted.length; i++) {
    const tied = points.filter(
      (point) => Math.abs(point.y - sorted[i].y) < 0.01,
    );
    const index = tied.findIndex((point) => point.id === sorted[i].id);
    const desired = sorted[i].y + (index - (tied.length - 1) / 2) * spacing;
    sorted[i].markerY = Math.max(
      top,
      desired,
      i ? sorted[i - 1].markerY + spacing : top,
    );
  }
  if (sorted.length && sorted.at(-1)!.markerY > bottom) {
    sorted[sorted.length - 1].markerY = bottom;
    for (let i = sorted.length - 2; i >= 0; i--)
      sorted[i].markerY = Math.min(
        sorted[i].markerY,
        sorted[i + 1].markerY - spacing,
      );
  }
  return sorted;
}

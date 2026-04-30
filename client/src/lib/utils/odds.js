const RATIO_TABLE = [
  [1, 5],   // ~1.2×
  [1, 4],   // ~1.25×
  [1, 3],   // ~1.33×
  [1, 2],   // ~1.5×
  [2, 3],   // ~1.67×
  [3, 4],   // ~1.75×
  [1, 1],   // ~2.0× (even money)
  [5, 4],   // ~2.25×
  [3, 2],   // ~2.5×
  [7, 4],   // ~2.75×
  [2, 1],   // ~3×
  [5, 2],   // ~3.5×
  [3, 1],   // ~4×
  [7, 2],   // ~4.5×
  [4, 1],   // ~5×
  [5, 1],   // ~6×
  [6, 1],   // ~7×
  [7, 1],   // ~8×
  [8, 1],   // ~9×
  [9, 1],   // ~10×
  [12, 1],  // ~13×
  [15, 1],  // ~16×
  [20, 1],  // ~21×
  [25, 1],  // ~26×
  [33, 1],  // ~34×
  [50, 1],  // ~51×
  [99, 1],  // ~100×
  [199, 1], // ~200×
];

export function formatOdds(multiplier) {
  if (!multiplier || multiplier <= 1) return '—';
  let best = RATIO_TABLE[0];
  let bestDiff = Infinity;
  for (const ratio of RATIO_TABLE) {
    const diff = Math.abs(multiplier - (1 + ratio[0] / ratio[1]));
    if (diff < bestDiff) { bestDiff = diff; best = ratio; }
  }
  return `${best[0]}:${best[1]}`;
}

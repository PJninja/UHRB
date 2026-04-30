export function formatOdds(multiplier) {
  if (!multiplier || multiplier <= 1) return '—';
  const profit = multiplier - 1;
  if (Number.isInteger(profit)) {
    return `${profit}:1`;
  } else {
    return `${Math.round(profit * 2)}:2`;
  }
}

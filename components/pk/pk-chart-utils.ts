import { CHART_COLORS } from "./pk-shared";

export const CHART_W = 560;
export const CHART_H = 210;
export const PAD_L = 54;
export const PAD_R = 12;
export const PAD_T = 12;
export const PAD_B = 40;

export function pickXTickIndices(length: number, maxTicks: number) {
  if (length <= 1) return [0];

  const lastIndex = length - 1;
  const wantedCount = Math.min(maxTicks, length);
  const indexSet = new Set<number>();

  for (let step = 0; step < wantedCount; step += 1) {
    const index = Math.round((step * lastIndex) / Math.max(1, wantedCount - 1));
    indexSet.add(Math.min(lastIndex, Math.max(0, index)));
  }

  return [...indexSet].sort((left, right) => left - right);
}

export function formatAxisDate(date: string) {
  const matched = date.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!matched) return date;

  const [, , month, day] = matched;
  return `${month}-${day}`;
}

export function getChartStroke(index: number) {
  return CHART_COLORS[index % CHART_COLORS.length]!;
}

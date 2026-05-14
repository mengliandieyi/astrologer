export function visibleBarsRange(total: number, visibleBars: number | null, maPeriods: number[]): { from: number; to: number } | null {
  if (total <= 0) return null;
  if (visibleBars == null) return null;
  const n = Math.max(20, Math.min(520, Math.floor(Number(visibleBars))));
  const maxMa = Math.max(
    5,
    ...((maPeriods || [])
      .map((x) => Math.floor(Number(x)))
      .filter((x) => Number.isFinite(x) && x > 1) as number[])
  );
  const warmupBars = Math.max(300, maxMa * 2);
  const withWarmup = Math.min(1200, n + warmupBars);
  return { from: Math.max(0, total - withWarmup), to: total - 1 };
}


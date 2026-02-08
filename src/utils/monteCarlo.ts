/**
 * Monte Carlo projection returning the median path.
 */
export function monteCarloProject(
  observedValues: number[],
  lastValue: number,
  lastMinute: number,
  numSims: number = 200
): { minute: number; value: number }[] {
  const paths = monteCarloMultiPath(observedValues, lastValue, lastMinute, numSims);
  if (paths.length === 0) return [];

  const numFutureMinutes = paths[0].length;
  const result: { minute: number; value: number }[] = [];
  for (let i = 0; i < numFutureMinutes; i++) {
    const values = paths.map(p => p[i].value).sort((a, b) => a - b);
    result.push({ minute: paths[0][i].minute, value: values[Math.floor(values.length / 2)] });
  }
  return result;
}

/**
 * Monte Carlo returning ALL individual simulation paths.
 * Each path is an array of { minute, value } for future minutes.
 */
export function monteCarloMultiPath(
  observedValues: number[],
  lastValue: number,
  lastMinute: number,
  numSims: number = 15
): { minute: number; value: number }[][] {
  if (observedValues.length === 0) return [];

  const mean = observedValues.reduce((s, v) => s + v, 0) / observedValues.length;
  const variance = observedValues.length > 1
    ? observedValues.reduce((s, v) => s + (v - mean) ** 2, 0) / (observedValues.length - 1)
    : 1;
  const stddev = Math.sqrt(variance) || 0.5;
  const meanReversion = 0.3;

  const futureMinutes: number[] = [];
  for (let m = lastMinute + 1; m <= 59; m++) futureMinutes.push(m);
  if (futureMinutes.length === 0) return [];

  const allPaths: { minute: number; value: number }[][] = [];
  for (let sim = 0; sim < numSims; sim++) {
    const path: { minute: number; value: number }[] = [];
    let current = lastValue;
    for (let i = 0; i < futureMinutes.length; i++) {
      const u1 = Math.random();
      const u2 = Math.random();
      const z = Math.sqrt(-2 * Math.log(u1 || 0.001)) * Math.cos(2 * Math.PI * u2);
      const drift = meanReversion * (mean - current);
      current = current + drift + stddev * 0.3 * z;
      path.push({ minute: futureMinutes[i], value: Math.max(0, Math.round(current)) });
    }
    allPaths.push(path);
  }
  return allPaths;
}


/**
 * Monte Carlo projection for an arbitrary number of future steps.
 * Returns percentile bands per step.
 */
export function monteCarloFlexible(
  observedValues: number[],
  lastValue: number,
  futureSteps: number,
  numSims: number = 200
): Map<number, { p10: number; p25: number; median: number; p75: number; p90: number }> {
  const result = new Map<number, { p10: number; p25: number; median: number; p75: number; p90: number }>();
  if (observedValues.length === 0 || futureSteps <= 0) return result;

  const mean = observedValues.reduce((s, v) => s + v, 0) / observedValues.length;
  const variance = observedValues.length > 1
    ? observedValues.reduce((s, v) => s + (v - mean) ** 2, 0) / (observedValues.length - 1)
    : 1;
  const stddev = Math.sqrt(variance) || 0.5;
  const meanReversion = 0.3;

  // Generate all paths
  const allPaths: number[][] = [];
  for (let sim = 0; sim < numSims; sim++) {
    const path: number[] = [];
    let current = lastValue;
    for (let i = 0; i < futureSteps; i++) {
      const u1 = Math.random();
      const u2 = Math.random();
      const z = Math.sqrt(-2 * Math.log(u1 || 0.001)) * Math.cos(2 * Math.PI * u2);
      const drift = meanReversion * (mean - current);
      current = current + drift + stddev * 0.3 * z;
      path.push(Math.max(0, Math.round(current)));
    }
    allPaths.push(path);
  }

  // Compute percentile bands
  for (let i = 0; i < futureSteps; i++) {
    const vals = allPaths.map(p => p[i]).sort((a, b) => a - b);
    const pct = (p: number) => vals[Math.floor(vals.length * p)] ?? 0;
    result.set(i + 1, {
      p10: pct(0.1),
      p25: pct(0.25),
      median: pct(0.5),
      p75: pct(0.75),
      p90: pct(0.9),
    });
  }

  return result;
}

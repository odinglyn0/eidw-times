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

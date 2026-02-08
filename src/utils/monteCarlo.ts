/**
 * Monte Carlo projection: given observed security times, simulate future minutes.
 * Uses a mean-reverting random walk with observed mean/stddev.
 * Runs `numSims` paths and returns the median at each future minute.
 */
export function monteCarloProject(
  observedValues: number[],
  lastValue: number,
  lastMinute: number,
  numSims: number = 200
): { minute: number; value: number }[] {
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

  const allPaths: number[][] = [];
  for (let sim = 0; sim < numSims; sim++) {
    const path: number[] = [];
    let current = lastValue;
    for (let i = 0; i < futureMinutes.length; i++) {
      const u1 = Math.random();
      const u2 = Math.random();
      const z = Math.sqrt(-2 * Math.log(u1 || 0.001)) * Math.cos(2 * Math.PI * u2);
      const drift = meanReversion * (mean - current);
      current = current + drift + stddev * 0.3 * z;
      path.push(Math.max(0, Math.round(current)));
    }
    allPaths.push(path);
  }

  const result: { minute: number; value: number }[] = [];
  for (let i = 0; i < futureMinutes.length; i++) {
    const values = allPaths.map(p => p[i]).sort((a, b) => a - b);
    const median = values[Math.floor(values.length / 2)];
    result.push({ minute: futureMinutes[i], value: median });
  }
  return result;
}

/**
 * Run a full Monte Carlo projection and return summary stats for the rest of the hour.
 */
export function getHourlyProjectionStats(
  observedValues: number[],
  lastValue: number,
  lastMinute: number,
  numSims: number = 500
): { maxTime: number; avgTime: number; peakMinute: number; projectedValues: { minute: number; value: number }[] } | null {
  if (observedValues.length === 0) return null;

  const mean = observedValues.reduce((s, v) => s + v, 0) / observedValues.length;
  const variance = observedValues.length > 1
    ? observedValues.reduce((s, v) => s + (v - mean) ** 2, 0) / (observedValues.length - 1)
    : 1;
  const stddev = Math.sqrt(variance) || 0.5;
  const meanReversion = 0.3;

  const futureMinutes: number[] = [];
  for (let m = lastMinute + 1; m <= 59; m++) futureMinutes.push(m);
  if (futureMinutes.length === 0) return null;

  const allPaths: number[][] = [];
  for (let sim = 0; sim < numSims; sim++) {
    const path: number[] = [];
    let current = lastValue;
    for (let i = 0; i < futureMinutes.length; i++) {
      const u1 = Math.random();
      const u2 = Math.random();
      const z = Math.sqrt(-2 * Math.log(u1 || 0.001)) * Math.cos(2 * Math.PI * u2);
      const drift = meanReversion * (mean - current);
      current = current + drift + stddev * 0.3 * z;
      path.push(Math.max(0, Math.round(current)));
    }
    allPaths.push(path);
  }

  // Compute median at each future minute
  const medians: { minute: number; value: number }[] = [];
  for (let i = 0; i < futureMinutes.length; i++) {
    const values = allPaths.map(p => p[i]).sort((a, b) => a - b);
    medians.push({ minute: futureMinutes[i], value: values[Math.floor(values.length / 2)] });
  }

  // Combine observed + projected for full-hour stats
  const allValues = [...observedValues, ...medians.map(m => m.value)];
  const maxTime = Math.max(...medians.map(m => m.value));
  const avgTime = Math.round(allValues.reduce((s, v) => s + v, 0) / allValues.length);

  // Find the minute with the biggest increase from the previous minute
  let peakMinute = futureMinutes[0];
  let biggestIncrease = 0;
  const fullTimeline = [...observedValues.map((v, i) => ({ minute: lastMinute - observedValues.length + 1 + i, value: v })), ...medians];
  for (let i = 1; i < fullTimeline.length; i++) {
    const increase = fullTimeline[i].value - fullTimeline[i - 1].value;
    if (increase > biggestIncrease) {
      biggestIncrease = increase;
      peakMinute = fullTimeline[i].minute;
    }
  }

  return { maxTime, avgTime, peakMinute, projectedValues: medians };
}

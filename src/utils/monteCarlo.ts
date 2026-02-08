export interface PercentileBands {
  p10: number;
  p25: number;
  median: number;
  p75: number;
  p90: number;
}

export interface DepartureSchedule {
  minuteOffset: number;
  count: number;
}

export interface ObservedPair {
  security: number;
  departures: number;
}

function randn(): number {
  const u1 = Math.random() || 0.001;
  const u2 = Math.random();
  return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
}

function percentile(sorted: number[], p: number): number {
  const idx = Math.floor(sorted.length * p);
  return sorted[Math.min(idx, sorted.length - 1)] ?? 0;
}

function linearRegression(xs: number[], ys: number[]): { alpha: number; beta: number; r: number } {
  const n = xs.length;
  if (n < 2) return { alpha: 0, beta: 0, r: 0 };

  const mx = xs.reduce((s, v) => s + v, 0) / n;
  const my = ys.reduce((s, v) => s + v, 0) / n;

  let ssxy = 0, ssxx = 0, ssyy = 0;
  for (let i = 0; i < n; i++) {
    const dx = xs[i] - mx;
    const dy = ys[i] - my;
    ssxy += dx * dy;
    ssxx += dx * dx;
    ssyy += dy * dy;
  }

  const beta = ssxx > 0 ? ssxy / ssxx : 0;
  const alpha = my - beta * mx;
  const r = (ssxx > 0 && ssyy > 0) ? ssxy / Math.sqrt(ssxx * ssyy) : 0;

  return { alpha, beta, r };
}

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

export function monteCarloDepartureAware(
  observedSecurity: number[],
  observedPairs: ObservedPair[],
  lastValue: number,
  futureDepartures: DepartureSchedule[],
  futureSteps: number,
  numSims: number = 200,
): Map<number, PercentileBands> {
  const result = new Map<number, PercentileBands>();
  if (observedSecurity.length === 0 || futureSteps <= 0) return result;

  const mean = observedSecurity.reduce((s, v) => s + v, 0) / observedSecurity.length;
  const variance = observedSecurity.length > 1
    ? observedSecurity.reduce((s, v) => s + (v - mean) ** 2, 0) / (observedSecurity.length - 1)
    : 1;
  const baseStddev = Math.sqrt(variance) || 0.5;

  const recentN = Math.min(observedSecurity.length, 10);
  const recentSlice = observedSecurity.slice(-recentN);
  let momentum = 0;
  if (recentSlice.length >= 3) {
    const xs = recentSlice.map((_, i) => i);
    const reg = linearRegression(xs, recentSlice);
    momentum = reg.beta;
  }

  let depBeta = 0;
  let depCorrelation = 0;
  let baselineDep = 0;

  if (observedPairs.length >= 3) {
    const depVals = observedPairs.map(p => p.departures);
    const secVals = observedPairs.map(p => p.security);
    const reg = linearRegression(depVals, secVals);
    depBeta = reg.beta;
    depCorrelation = Math.abs(reg.r);
    baselineDep = depVals.reduce((s, v) => s + v, 0) / depVals.length;
  } else if (observedPairs.length > 0) {
    baselineDep = observedPairs.reduce((s, p) => s + p.departures, 0) / observedPairs.length;
    depBeta = 0.15;
    depCorrelation = 0.3;
  }

  const depByMinute = new Map<number, number>();
  for (const d of futureDepartures) {
    depByMinute.set(d.minuteOffset, d.count);
  }

  const futureDepValues = futureDepartures.map(d => d.count);
  const avgFutureDep = futureDepValues.length > 0
    ? futureDepValues.reduce((s, v) => s + v, 0) / futureDepValues.length
    : baselineDep;

  const referenceDep = Math.max(baselineDep, 0.5);

  const MEAN_REVERSION = 0.20;
  const MOMENTUM_DECAY = 0.97;
  const NOISE_SCALE = 0.30;
  const DEP_DRIFT_WEIGHT = 0.6;
  const DEP_VOL_WEIGHT = 0.4;
  const MAX_DEP_MULTIPLIER = 3.0;
  const MOMENTUM_WEIGHT = 0.15;

  const correlationScale = 0.3 + 0.7 * depCorrelation;

  const allPaths: number[][] = [];

  for (let sim = 0; sim < numSims; sim++) {
    const path: number[] = [];
    let current = lastValue;
    let currentMomentum = momentum;

    for (let i = 0; i < futureSteps; i++) {
      const minuteOffset = i + 1;

      const depCount = depByMinute.get(minuteOffset) ?? avgFutureDep;
      const depRatio = Math.min(depCount / referenceDep, MAX_DEP_MULTIPLIER);
      const depPressure = (depRatio - 1.0) * correlationScale;

      const meanRevDrift = MEAN_REVERSION * (mean - current);

      const depDrift = DEP_DRIFT_WEIGHT * depBeta * (depCount - referenceDep) * correlationScale;

      const momentumDrift = MOMENTUM_WEIGHT * currentMomentum;
      currentMomentum *= MOMENTUM_DECAY;

      const totalDrift = meanRevDrift + depDrift + momentumDrift;

      const volMultiplier = 1.0 + DEP_VOL_WEIGHT * Math.max(depPressure, -0.5);
      const noise = NOISE_SCALE * baseStddev * volMultiplier * randn();

      current = current + totalDrift + noise;
      current = Math.max(0, current);
      path.push(Math.round(current));
    }

    allPaths.push(path);
  }

  for (let i = 0; i < futureSteps; i++) {
    const vals = allPaths.map(p => p[i]).sort((a, b) => a - b);
    result.set(i + 1, {
      p10: percentile(vals, 0.10),
      p25: percentile(vals, 0.25),
      median: percentile(vals, 0.50),
      p75: percentile(vals, 0.75),
      p90: percentile(vals, 0.90),
    });
  }

  return result;
}

/**
 * Monte Carlo simulation engine for security wait time projections.
 *
 * The departure-aware model works by:
 * 1. Learning the empirical correlation between departure volume and security
 *    wait times from the observed historical window.
 * 2. Computing a per-minute "departure pressure" signal for the future window
 *    by comparing each future minute's departure count against the baseline
 *    (average departures during the observed period).
 * 3. At each simulation step the drift term has three components:
 *    a) Mean-reversion toward the historical average (stabiliser)
 *    b) Departure-pressure drift (pushes the walk up when flights spike,
 *       pulls it down when flights thin out)
 *    c) Momentum from the recent observed trend
 * 4. Volatility (noise amplitude) is also scaled by departure pressure so
 *    the confidence bands widen during busy periods and tighten during quiet ones.
 */

// ─── Types ──────────────────────────────────────────────────────────────────

export interface PercentileBands {
  p10: number;
  p25: number;
  median: number;
  p75: number;
  p90: number;
}

export interface DepartureSchedule {
  /** Minute offset from projection start (1-based). */
  minuteOffset: number;
  /** Number of departures at this minute. */
  count: number;
}

export interface ObservedPair {
  /** Security wait time in minutes. */
  security: number;
  /** Departure count at the same timestamp. */
  departures: number;
}

// ─── Helpers ────────────────────────────────────────────────────────────────

/** Box-Muller transform — returns a standard-normal random variate. */
function randn(): number {
  const u1 = Math.random() || 0.001;
  const u2 = Math.random();
  return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
}

/** Percentile from a sorted array. */
function percentile(sorted: number[], p: number): number {
  const idx = Math.floor(sorted.length * p);
  return sorted[Math.min(idx, sorted.length - 1)] ?? 0;
}

/** Simple linear regression: y = α + β·x.  Returns { alpha, beta, r }. */
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

// ─── Legacy functions (kept for backward compat with other callers) ─────────

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

// ─── Departure-aware Monte Carlo ────────────────────────────────────────────

/**
 * Departure-aware Monte Carlo projection.
 *
 * @param observedSecurity  - Array of observed security wait times (minutes),
 *                            ordered chronologically.
 * @param observedPairs     - Paired (security, departures) observations from
 *                            the historical window. Used to learn the
 *                            departure→security correlation.
 * @param lastValue         - The most recent observed security wait time.
 * @param futureDepartures  - Per-minute departure counts for the projection
 *                            window. minuteOffset is 1-based (1 = first
 *                            minute after "now").
 * @param futureSteps       - Total number of future minutes to project.
 * @param numSims           - Number of simulation paths (default 200).
 *
 * @returns Map from minuteOffset (1-based) → percentile bands.
 */
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

  // ── 1. Baseline statistics from observed security times ──────────────

  const mean = observedSecurity.reduce((s, v) => s + v, 0) / observedSecurity.length;
  const variance = observedSecurity.length > 1
    ? observedSecurity.reduce((s, v) => s + (v - mean) ** 2, 0) / (observedSecurity.length - 1)
    : 1;
  const baseStddev = Math.sqrt(variance) || 0.5;

  // Recent trend: slope of last N observations (momentum)
  const recentN = Math.min(observedSecurity.length, 10);
  const recentSlice = observedSecurity.slice(-recentN);
  let momentum = 0;
  if (recentSlice.length >= 3) {
    const xs = recentSlice.map((_, i) => i);
    const reg = linearRegression(xs, recentSlice);
    momentum = reg.beta; // minutes per step
  }

  // ── 2. Learn departure → security relationship ──────────────────────

  // Compute regression: security = α + β·departures
  let depBeta = 0;       // how much 1 extra departure adds to wait time
  let depCorrelation = 0; // strength of the relationship (|r|)
  let baselineDep = 0;   // average departures in the observed window

  if (observedPairs.length >= 3) {
    const depVals = observedPairs.map(p => p.departures);
    const secVals = observedPairs.map(p => p.security);
    const reg = linearRegression(depVals, secVals);
    depBeta = reg.beta;
    depCorrelation = Math.abs(reg.r);
    baselineDep = depVals.reduce((s, v) => s + v, 0) / depVals.length;
  } else if (observedPairs.length > 0) {
    // Not enough pairs for regression — use a simple heuristic:
    // assume each departure above baseline adds ~0.15 min to wait time
    baselineDep = observedPairs.reduce((s, p) => s + p.departures, 0) / observedPairs.length;
    depBeta = 0.15;
    depCorrelation = 0.3; // low confidence
  }

  // Build a lookup: minuteOffset → departure count
  const depByMinute = new Map<number, number>();
  for (const d of futureDepartures) {
    depByMinute.set(d.minuteOffset, d.count);
  }

  // Average future departures (for normalisation)
  const futureDepValues = futureDepartures.map(d => d.count);
  const avgFutureDep = futureDepValues.length > 0
    ? futureDepValues.reduce((s, v) => s + v, 0) / futureDepValues.length
    : baselineDep;

  // Use the larger of observed baseline and future average as the reference
  // so that the "pressure" signal is relative to what the model has seen.
  const referenceDep = Math.max(baselineDep, 0.5);

  // ── 3. Tuning constants ─────────────────────────────────────────────

  const MEAN_REVERSION = 0.20;       // pull toward historical mean
  const MOMENTUM_DECAY = 0.97;       // momentum fades over time
  const NOISE_SCALE = 0.30;          // base noise amplitude
  const DEP_DRIFT_WEIGHT = 0.6;      // how strongly departures affect drift
  const DEP_VOL_WEIGHT = 0.4;        // how strongly departures affect volatility
  const MAX_DEP_MULTIPLIER = 3.0;    // cap on departure pressure multiplier
  const MOMENTUM_WEIGHT = 0.15;      // how strongly recent trend carries forward

  // Scale departure influence by correlation strength — if the historical
  // data shows departures and security are tightly linked, trust it more.
  const correlationScale = 0.3 + 0.7 * depCorrelation; // range [0.3, 1.0]

  // ── 4. Run simulations ──────────────────────────────────────────────

  const allPaths: number[][] = [];

  for (let sim = 0; sim < numSims; sim++) {
    const path: number[] = [];
    let current = lastValue;
    let currentMomentum = momentum;

    for (let i = 0; i < futureSteps; i++) {
      const minuteOffset = i + 1;

      // --- Departure pressure at this minute ---
      const depCount = depByMinute.get(minuteOffset) ?? avgFutureDep;
      // Ratio vs baseline: >1 means busier than average, <1 means quieter
      const depRatio = Math.min(depCount / referenceDep, MAX_DEP_MULTIPLIER);
      // Pressure: how far above/below baseline (centred at 0)
      const depPressure = (depRatio - 1.0) * correlationScale;

      // --- Drift components ---
      // a) Mean reversion
      const meanRevDrift = MEAN_REVERSION * (mean - current);

      // b) Departure-driven drift: positive pressure → queue grows
      //    Uses the learned beta to scale appropriately
      const depDrift = DEP_DRIFT_WEIGHT * depBeta * (depCount - referenceDep) * correlationScale;

      // c) Momentum (decaying)
      const momentumDrift = MOMENTUM_WEIGHT * currentMomentum;
      currentMomentum *= MOMENTUM_DECAY;

      const totalDrift = meanRevDrift + depDrift + momentumDrift;

      // --- Volatility: scale noise by departure pressure ---
      // Busier periods → more uncertainty; quiet periods → tighter bands
      const volMultiplier = 1.0 + DEP_VOL_WEIGHT * Math.max(depPressure, -0.5);
      const noise = NOISE_SCALE * baseStddev * volMultiplier * randn();

      // --- Step ---
      current = current + totalDrift + noise;
      current = Math.max(0, current);
      path.push(Math.round(current));
    }

    allPaths.push(path);
  }

  // ── 5. Compute percentile bands ─────────────────────────────────────

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

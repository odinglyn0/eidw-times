interface DatapulseSeal {
  me: number;
  se: number;
  ke: number;
  te: number;
  ir: number;
  ec: number;
  ts: number;
  sig: string;
}

interface DatapulseCollector {
  start: () => void;
  stop: () => void;
  getSeal: () => DatapulseSeal;
}

async function hmacSha256Hex(key: string, data: string): Promise<string> {
  const enc = new TextEncoder();
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    enc.encode(key),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", cryptoKey, enc.encode(data));
  return Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

let _sessionKey: string | null = null;
let _fingerprint: string | null = null;

export function datapulseInit(sessionKey: string, fingerprint: string): void {
  _sessionKey = sessionKey;
  _fingerprint = fingerprint;
}

export function datapulseCreateCollector(): DatapulseCollector {
  let mousePositions: { x: number; y: number; t: number }[] = [];
  let scrollPositions: { y: number; t: number }[] = [];
  let keyTimings: number[] = [];
  let touchPressures: number[] = [];
  let lastActivityTime = performance.now();
  let totalIdleTime = 0;
  let eventCount = 0;
  let startTime = 0;
  let active = false;

  const onMouseMove = (e: MouseEvent) => {
    eventCount++;
    lastActivityTime = performance.now();
    mousePositions.push({ x: e.clientX, y: e.clientY, t: performance.now() });
    if (mousePositions.length > 100) mousePositions.shift();
  };

  const onScroll = () => {
    eventCount++;
    lastActivityTime = performance.now();
    scrollPositions.push({ y: window.scrollY, t: performance.now() });
    if (scrollPositions.length > 50) scrollPositions.shift();
  };

  const onKeyDown = () => {
    eventCount++;
    lastActivityTime = performance.now();
    keyTimings.push(performance.now());
    if (keyTimings.length > 50) keyTimings.shift();
  };

  const onTouchStart = (e: TouchEvent) => {
    eventCount++;
    lastActivityTime = performance.now();
    for (let i = 0; i < e.touches.length; i++) {
      const touch = e.touches[i];
      touchPressures.push((touch as unknown as { force?: number }).force || 0.5);
    }
    if (touchPressures.length > 50) touchPressures.splice(0, touchPressures.length - 50);
  };

  function computeMouseEntropy(): number {
    if (mousePositions.length < 3) return 0;
    let totalAngleChange = 0;
    let totalDistance = 0;
    for (let i = 1; i < mousePositions.length; i++) {
      const dx = mousePositions[i].x - mousePositions[i - 1].x;
      const dy = mousePositions[i].y - mousePositions[i - 1].y;
      totalDistance += Math.sqrt(dx * dx + dy * dy);
      if (i >= 2) {
        const dx1 = mousePositions[i - 1].x - mousePositions[i - 2].x;
        const dy1 = mousePositions[i - 1].y - mousePositions[i - 2].y;
        const angle1 = Math.atan2(dy1, dx1);
        const angle2 = Math.atan2(dy, dx);
        totalAngleChange += Math.abs(angle2 - angle1);
      }
    }
    const avgAngle = totalAngleChange / Math.max(mousePositions.length - 2, 1);
    const avgDist = totalDistance / Math.max(mousePositions.length - 1, 1);
    return Math.min((avgAngle * avgDist) / 500, 1.0);
  }

  function computeScrollEntropy(): number {
    if (scrollPositions.length < 2) return 0;
    let velocities: number[] = [];
    for (let i = 1; i < scrollPositions.length; i++) {
      const dt = scrollPositions[i].t - scrollPositions[i - 1].t;
      if (dt > 0) {
        velocities.push(Math.abs(scrollPositions[i].y - scrollPositions[i - 1].y) / dt);
      }
    }
    if (velocities.length < 2) return 0;
    const mean = velocities.reduce((a, b) => a + b, 0) / velocities.length;
    const variance = velocities.reduce((a, v) => a + (v - mean) ** 2, 0) / velocities.length;
    return Math.min(Math.sqrt(variance) / 10, 1.0);
  }

  function computeKeyEntropy(): number {
    if (keyTimings.length < 3) return 0;
    let intervals: number[] = [];
    for (let i = 1; i < keyTimings.length; i++) {
      intervals.push(keyTimings[i] - keyTimings[i - 1]);
    }
    const mean = intervals.reduce((a, b) => a + b, 0) / intervals.length;
    const variance = intervals.reduce((a, v) => a + (v - mean) ** 2, 0) / intervals.length;
    return Math.min(Math.sqrt(variance) / 500, 1.0);
  }

  function computeTouchEntropy(): number {
    if (touchPressures.length < 2) return 0;
    const mean = touchPressures.reduce((a, b) => a + b, 0) / touchPressures.length;
    const variance = touchPressures.reduce((a, v) => a + (v - mean) ** 2, 0) / touchPressures.length;
    return Math.min(Math.sqrt(variance) * 3, 1.0);
  }

  return {
    start() {
      if (active) return;
      active = true;
      startTime = performance.now();
      lastActivityTime = startTime;
      document.addEventListener("mousemove", onMouseMove, { passive: true });
      document.addEventListener("scroll", onScroll, { passive: true });
      document.addEventListener("keydown", onKeyDown, { passive: true });
      document.addEventListener("touchstart", onTouchStart, { passive: true });
    },

    stop() {
      if (!active) return;
      active = false;
      document.removeEventListener("mousemove", onMouseMove);
      document.removeEventListener("scroll", onScroll);
      document.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("touchstart", onTouchStart);
    },

    getSeal(): DatapulseSeal {
      const elapsed = performance.now() - startTime;
      const idleThreshold = 3000;
      const now = performance.now();
      if (now - lastActivityTime > idleThreshold) {
        totalIdleTime += now - lastActivityTime - idleThreshold;
      }
      const idleRatio = elapsed > 0 ? Math.min(totalIdleTime / elapsed, 1.0) : 0;

      return {
        me: parseFloat(computeMouseEntropy().toFixed(6)),
        se: parseFloat(computeScrollEntropy().toFixed(6)),
        ke: parseFloat(computeKeyEntropy().toFixed(6)),
        te: parseFloat(computeTouchEntropy().toFixed(6)),
        ir: parseFloat(idleRatio.toFixed(6)),
        ec: eventCount,
        ts: Date.now(),
        sig: "",
      };
    },
  };
}

export async function datapulseSignSeal(seal: Omit<DatapulseSeal, "sig">): Promise<DatapulseSeal> {
  if (!_sessionKey || !_fingerprint) {
    return { ...seal, sig: "" };
  }
  const { sig: _discard, ...rest } = seal as DatapulseSeal;
  void _discard;
  const canonical = JSON.stringify(
    Object.keys(rest)
      .sort()
      .reduce((obj: Record<string, unknown>, key) => {
        obj[key] = (rest as Record<string, unknown>)[key];
        return obj;
      }, {})
  );
  const computed = await hmacSha256Hex(_sessionKey, `${_fingerprint}|${canonical}`);
  return { ...rest, sig: computed };
}

export type { DatapulseSeal };

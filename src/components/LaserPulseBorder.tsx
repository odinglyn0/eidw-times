import React, { useEffect, useRef } from "react";

export interface LaserPulseConfig {
  color?: string;
  duration?: number;
  pulseWidth?: number;
  bulgeAmount?: number;
  bulgeSpread?: number;
  borderRadius?: number;
  borderWidth?: number;
  rampDuration?: number;
  fadeOutDuration?: number;
}

const DEFAULTS: Required<LaserPulseConfig> = {
  color: "#4CAF50",
  duration: 600,
  pulseWidth: 50,
  bulgeAmount: 4,
  bulgeSpread: 36,
  borderRadius: 8,
  borderWidth: 2,
  rampDuration: 1200,
  fadeOutDuration: 100,
};

interface Props {
  active: boolean;
  config?: LaserPulseConfig;
  children: React.ReactNode;
  className?: string;
}

// Pre-baked perimeter geometry — computed once per resize, reused every frame
interface Perimeter {
  xs: Float32Array;
  ys: Float32Array;
  nxs: Float32Array;
  nys: Float32Array;
  cumDist: Float32Array; // cumulative distance at each point
  totalLen: number;
  count: number;
}

function buildPerimeter(w: number, h: number, r: number): Perimeter {
  // ~200 points is plenty for smooth visuals
  const pts: { x: number; y: number; nx: number; ny: number }[] = [];
  const cSegs = 10; // corner segments
  const sSegs = 30; // straight segments per side

  const arc = (cx: number, cy: number, a0: number, a1: number) => {
    for (let i = 0; i <= cSegs; i++) {
      const a = a0 + (a1 - a0) * (i / cSegs);
      const cos = Math.cos(a), sin = Math.sin(a);
      pts.push({ x: cx + r * cos, y: cy + r * sin, nx: cos, ny: sin });
    }
  };
  const line = (x1: number, y1: number, x2: number, y2: number, nx: number, ny: number) => {
    for (let i = 0; i <= sSegs; i++) {
      const t = i / sSegs;
      pts.push({ x: x1 + (x2 - x1) * t, y: y1 + (y2 - y1) * t, nx, ny });
    }
  };

  line(r, 0, w - r, 0, 0, -1);
  arc(w - r, r, -Math.PI / 2, 0);
  line(w, r, w, h - r, 1, 0);
  arc(w - r, h - r, 0, Math.PI / 2);
  line(w - r, h, r, h, 0, 1);
  arc(r, h - r, Math.PI / 2, Math.PI);
  line(0, h - r, 0, r, -1, 0);
  arc(r, r, Math.PI, Math.PI * 1.5);

  const n = pts.length;
  const xs = new Float32Array(n);
  const ys = new Float32Array(n);
  const nxs = new Float32Array(n);
  const nys = new Float32Array(n);
  const cumDist = new Float32Array(n);

  xs[0] = pts[0].x; ys[0] = pts[0].y;
  nxs[0] = pts[0].nx; nys[0] = pts[0].ny;
  cumDist[0] = 0;

  for (let i = 1; i < n; i++) {
    xs[i] = pts[i].x; ys[i] = pts[i].y;
    nxs[i] = pts[i].nx; nys[i] = pts[i].ny;
    const dx = xs[i] - xs[i - 1], dy = ys[i] - ys[i - 1];
    cumDist[i] = cumDist[i - 1] + Math.sqrt(dx * dx + dy * dy);
  }

  return { xs, ys, nxs, nys, cumDist, totalLen: cumDist[n - 1], count: n };
}

// Binary search for the segment containing distance d
function interpAtDist(p: Perimeter, dist: number): { x: number; y: number; nx: number; ny: number } {
  const d = ((dist % p.totalLen) + p.totalLen) % p.totalLen;
  let lo = 0, hi = p.count - 1;
  while (lo < hi - 1) {
    const mid = (lo + hi) >> 1;
    if (p.cumDist[mid] <= d) lo = mid; else hi = mid;
  }
  const segLen = p.cumDist[hi] - p.cumDist[lo];
  const t = segLen > 0 ? (d - p.cumDist[lo]) / segLen : 0;
  return {
    x: p.xs[lo] + (p.xs[hi] - p.xs[lo]) * t,
    y: p.ys[lo] + (p.ys[hi] - p.ys[lo]) * t,
    nx: p.nxs[lo] + (p.nxs[hi] - p.nxs[lo]) * t,
    ny: p.nys[lo] + (p.nys[hi] - p.nys[lo]) * t,
  };
}

const LaserPulseBorder: React.FC<Props> = ({ active, config, children, className }) => {
  const cfg = { ...DEFAULTS, ...config };
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animRef = useRef(0);
  const wasActiveRef = useRef(false);
  const fadeStartRef = useRef<number | null>(null);
  const startTimeRef = useRef(0);
  const progressRef = useRef(0);
  const lastFrameRef = useRef(0);
  // Cache the perimeter and config color to avoid rebuilding
  const perimRef = useRef<Perimeter | null>(null);
  const sizeRef = useRef<{ w: number; h: number }>({ w: 0, h: 0 });

  useEffect(() => {
    const container = containerRef.current;
    const canvas = canvasRef.current;
    if (!container || !canvas) return;

    const rect = container.getBoundingClientRect();
    const w = rect.width, h = rect.height;
    if (w === 0 || h === 0) return;
    const dpr = window.devicePixelRatio || 1;

    // Only rebuild perimeter if size changed
    if (sizeRef.current.w !== w || sizeRef.current.h !== h || !perimRef.current) {
      canvas.width = w * dpr;
      canvas.height = h * dpr;
      canvas.style.width = `${w}px`;
      canvas.style.height = `${h}px`;
      perimRef.current = buildPerimeter(w, h, cfg.borderRadius);
      sizeRef.current = { w, h };
    }

    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const perim = perimRef.current;
    const totalLen = perim.totalLen;
    const bulgeRadius = cfg.bulgeSpread * 3; // only compute bulge within this distance

    if (active && !wasActiveRef.current) {
      startTimeRef.current = performance.now();
      progressRef.current = 0;
      lastFrameRef.current = performance.now();
      fadeStartRef.current = null;
    }
    if (!active && wasActiveRef.current) {
      fadeStartRef.current = performance.now();
    }
    wasActiveRef.current = active;

    const { color, duration, pulseWidth, bulgeAmount, bulgeSpread, borderWidth, rampDuration, fadeOutDuration } = cfg;
    const invTwoBulgeSqr = 1 / (2 * bulgeSpread * bulgeSpread);
    const trailSteps = 12;
    const trailLen = pulseWidth * 1.5;

    const animate = (now: number) => {
      const dt = now - lastFrameRef.current;
      lastFrameRef.current = now;

      // Speed ramp
      const elapsed = now - startTimeRef.current;
      const rampT = Math.min(1, elapsed / rampDuration);
      const speed = (totalLen / duration) * (0.4 + 0.6 * rampT * rampT);

      // Fade-out
      let alpha = 1;
      if (fadeStartRef.current !== null) {
        alpha = Math.max(0, 1 - (now - fadeStartRef.current) / fadeOutDuration);
        if (alpha <= 0) { ctx.clearRect(0, 0, w, h); return; }
      }

      progressRef.current += speed * dt;
      const pulseDist = progressRef.current % totalLen;

      ctx.clearRect(0, 0, w, h);

      // ── Draw bulged border ──
      ctx.beginPath();
      for (let i = 0; i < perim.count; i++) {
        const cd = perim.cumDist[i];
        let dtp = Math.abs(cd - pulseDist);
        if (dtp > totalLen * 0.5) dtp = totalLen - dtp;

        let bx = perim.xs[i], by = perim.ys[i];
        if (dtp < bulgeRadius) {
          const b = bulgeAmount * Math.exp(-(dtp * dtp) * invTwoBulgeSqr);
          bx += perim.nxs[i] * b;
          by += perim.nys[i] * b;
        }
        if (i === 0) ctx.moveTo(bx, by); else ctx.lineTo(bx, by);
      }
      ctx.closePath();
      ctx.strokeStyle = color;
      ctx.lineWidth = borderWidth;
      ctx.globalAlpha = alpha * 0.45;
      ctx.stroke();

      // ── Draw pulse glow ──
      const pp = interpAtDist(perim, pulseDist);
      const gr = pulseWidth * 0.5;
      const grad = ctx.createRadialGradient(pp.x, pp.y, 0, pp.x, pp.y, gr);
      grad.addColorStop(0, color);
      grad.addColorStop(0.25, color + "CC");
      grad.addColorStop(0.6, color + "44");
      grad.addColorStop(1, color + "00");
      ctx.globalAlpha = alpha;
      ctx.beginPath();
      ctx.arc(pp.x, pp.y, gr, 0, Math.PI * 2);
      ctx.fillStyle = grad;
      ctx.fill();

      // ── Trail ──
      const bw2 = borderWidth * 2;
      for (let i = 0; i < trailSteps; i++) {
        const t = (i + 1) / trailSteps;
        const tp = interpAtDist(perim, pulseDist - trailLen * t);
        ctx.globalAlpha = alpha * (1 - t) * 0.5;
        ctx.beginPath();
        ctx.arc(tp.x, tp.y, bw2 * (1 - t * 0.5), 0, Math.PI * 2);
        ctx.fillStyle = color;
        ctx.fill();
      }

      ctx.globalAlpha = 1;
      animRef.current = requestAnimationFrame(animate);
    };

    if (active || fadeStartRef.current !== null) {
      lastFrameRef.current = performance.now();
      animRef.current = requestAnimationFrame(animate);
    } else {
      ctx.clearRect(0, 0, w, h);
    }

    return () => { cancelAnimationFrame(animRef.current); };
  }, [active, cfg.duration, cfg.color, cfg.pulseWidth, cfg.bulgeAmount, cfg.bulgeSpread, cfg.borderRadius, cfg.borderWidth, cfg.rampDuration, cfg.fadeOutDuration]);

  return (
    <div ref={containerRef} className={className} style={{ position: "relative" }}>
      {children}
      <canvas
        ref={canvasRef}
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          width: "100%",
          height: "100%",
          pointerEvents: "none",
          zIndex: 50,
        }}
      />
    </div>
  );
};

export default LaserPulseBorder;

import React, { useMemo } from 'react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import {
  ResponsiveContainer, ComposedChart, Line, Bar, Area, XAxis, YAxis,
  CartesianGrid, Tooltip, ReferenceLine,
} from 'recharts';
import { monteCarloMultiPath } from '@/utils/monteCarlo';
import { parseISO, getMinutes } from 'date-fns';

interface GranularSecurityData {
  timestamp: string;
  time: number | null;
}

interface GranularDepartureData {
  timestamp: string;
  count: number | null;
}

interface HourGraphDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  terminalId: 1 | 2;
  securityData: GranularSecurityData[];
  departureData: GranularDepartureData[];
  currentTime: number | null;
}

const NUM_SIM_PATHS = 200;

const HourGraphDialog: React.FC<HourGraphDialogProps> = ({
  open, onOpenChange, terminalId, securityData, departureData, currentTime,
}) => {
  const chartData = useMemo(() => {
    const currentMinute = new Date().getMinutes();

    const secByMinute = new Map<number, number>();
    securityData.filter(d => d.time !== null).forEach(d => {
      secByMinute.set(getMinutes(parseISO(d.timestamp)), d.time!);
    });

    const depByMinute = new Map<number, number>();
    departureData.filter(d => d.count !== null).forEach(d => {
      const m = getMinutes(parseISO(d.timestamp));
      depByMinute.set(m, (depByMinute.get(m) || 0) + d.count!);
    });

    const observedValues = Array.from(secByMinute.entries())
      .filter(([m]) => m <= currentMinute)
      .sort(([a], [b]) => a - b)
      .map(([, v]) => v);

    const lastObserved = observedValues.length > 0 ? observedValues[observedValues.length - 1] : null;
    const lastMinute = observedValues.length > 0
      ? Array.from(secByMinute.entries())
          .filter(([m]) => m <= currentMinute)
          .sort(([a], [b]) => a - b)
          .pop()![0]
      : 0;

    let simPaths: { minute: number; value: number }[][] = [];
    if (lastObserved !== null && observedValues.length > 0) {
      simPaths = monteCarloMultiPath(observedValues, lastObserved, lastMinute, NUM_SIM_PATHS);
    }

    // Compute percentile bands from sim paths
    const bandByMinute = new Map<number, { p10: number; p25: number; median: number; p75: number; p90: number }>();
    if (simPaths.length > 0) {
      const numFuture = simPaths[0].length;
      for (let i = 0; i < numFuture; i++) {
        const vals = simPaths.map(p => p[i].value).sort((a, b) => a - b);
        const pct = (p: number) => vals[Math.floor(vals.length * p)] ?? 0;
        bandByMinute.set(simPaths[0][i].minute, {
          p10: pct(0.1),
          p25: pct(0.25),
          median: pct(0.5),
          p75: pct(0.75),
          p90: pct(0.9),
        });
      }
    }

    // Build the full 0-59 minute dataset
    const points: Record<string, any>[] = [];
    for (let m = 0; m <= 59; m++) {
      const point: Record<string, any> = { minute: m };
      point.departures = depByMinute.get(m) || 0;

      if (m <= currentMinute && secByMinute.has(m)) {
        point.security = secByMinute.get(m)!;
      } else {
        point.security = null;
      }

      const band = bandByMinute.get(m);
      if (band) {
        point.median = band.median;
        point.bandOuter = [band.p10, band.p90];
        point.bandInner = [band.p25, band.p75];
      } else {
        point.median = null;
        point.bandOuter = null;
        point.bandInner = null;
      }

      points.push(point);
    }

    // Bridge: connect last actual point to the projection
    if (lastObserved !== null) {
      const bridgePoint = points.find(p => p.minute === lastMinute);
      if (bridgePoint) {
        bridgePoint.median = bridgePoint.security;
        bridgePoint.bandOuter = [bridgePoint.security, bridgePoint.security];
        bridgePoint.bandInner = [bridgePoint.security, bridgePoint.security];
      }
    }

    return { points, currentMinute, hasProjection: simPaths.length > 0 };
  }, [securityData, departureData, currentTime]);

  const { points, currentMinute, hasProjection } = chartData;

  const allSecValues = points.map(p => p.security).filter((v): v is number => v !== null);
  const allMedianValues = points.map(p => p.median).filter((v): v is number => v !== null);
  const allBandValues = points
    .flatMap(p => (p.bandOuter ? [p.bandOuter[0], p.bandOuter[1]] : []))
    .filter((v): v is number => v !== null);
  const allDepValues = points.map(p => p.departures).filter((v): v is number => v !== null);

  const maxSec = Math.max(...allSecValues, ...allMedianValues, ...allBandValues, 1);
  const maxDep = Math.max(...allDepValues, 1);

  const currentHour = new Date().getHours();
  const formatHour = (h: number) => `${h % 12 || 12}:00 ${h >= 12 ? 'PM' : 'AM'}`;

  const observedCount = securityData.filter(d => d.time !== null).length;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl w-[95vw] max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-lg">
            Hour Graph — T{terminalId} ({formatHour(currentHour)})
          </DialogTitle>
          <DialogDescription className="text-xs">
            Minute-by-minute security wait times and departures with Monte Carlo projection
          </DialogDescription>
        </DialogHeader>

        <div className="h-[350px] w-full mt-1">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={points} margin={{ top: 10, right: 10, left: 0, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} opacity={0.15} />
              <XAxis
                dataKey="minute"
                tickFormatter={(v) => `${v}m`}
                fontSize={10}
                axisLine={false}
                tickLine={false}
                interval={4}
              />
              <YAxis
                yAxisId="security"
                tickFormatter={(v) => `${v}m`}
                fontSize={10}
                axisLine={false}
                tickLine={false}
                domain={[0, Math.ceil(maxSec * 1.15)]}
                width={35}
              />
              <YAxis
                yAxisId="departures"
                orientation="right"
                fontSize={10}
                axisLine={false}
                tickLine={false}
                domain={[0, Math.ceil(maxDep * 1.3)]}
                width={30}
              />

              <Tooltip
                content={<CustomTooltip />}
                cursor={{ stroke: 'rgba(255,255,255,0.15)', strokeWidth: 1 }}
              />

              {/* Current minute marker */}
              <ReferenceLine
                x={currentMinute}
                yAxisId="security"
                stroke="rgba(255,255,255,0.25)"
                strokeDasharray="3 3"
                strokeWidth={1}
              />

              {/* Departure bars */}
              <Bar
                yAxisId="departures"
                dataKey="departures"
                fill="rgba(239, 68, 68, 0.25)"
                radius={[2, 2, 0, 0]}
              />

              {/* Outer confidence band (10th-90th percentile) */}
              <Area
                yAxisId="security"
                type="natural"
                dataKey="bandOuter"
                fill="rgba(74, 222, 128, 0.08)"
                stroke="none"
                connectNulls={false}
                isAnimationActive={false}
              />

              {/* Inner confidence band (25th-75th percentile) */}
              <Area
                yAxisId="security"
                type="natural"
                dataKey="bandInner"
                fill="rgba(74, 222, 128, 0.15)"
                stroke="none"
                connectNulls={false}
                isAnimationActive={false}
              />

              {/* Median projection line */}
              <Line
                yAxisId="security"
                type="natural"
                dataKey="median"
                stroke="rgba(74, 222, 128, 0.6)"
                strokeWidth={2}
                strokeDasharray="6 3"
                dot={false}
                connectNulls={false}
                isAnimationActive={false}
              />

              {/* Actual security time */}
              <Line
                yAxisId="security"
                type="natural"
                dataKey="security"
                stroke="#22c55e"
                strokeWidth={2.5}
                dot={false}
                connectNulls={true}
                activeDot={{ r: 3, fill: '#22c55e', stroke: '#fff', strokeWidth: 1.5 }}
              />
            </ComposedChart>
          </ResponsiveContainer>
        </div>

        {/* Legend */}
        <div className="flex flex-wrap items-center gap-x-5 gap-y-1 text-[11px] text-muted-foreground justify-center">
          <span className="flex items-center gap-1.5">
            <span className="inline-block w-5 h-[2.5px] bg-green-500 rounded-full" />
            Security (actual)
          </span>
          {hasProjection && (
            <>
              <span className="flex items-center gap-1.5">
                <span className="inline-block w-5 h-[2px] rounded-full" style={{ borderTop: '2px dashed rgba(74,222,128,0.6)' }} />
                Median projection
              </span>
              <span className="flex items-center gap-1.5">
                <span className="inline-block w-4 h-3 rounded-sm" style={{ background: 'rgba(74, 222, 128, 0.15)' }} />
                50% range
              </span>
              <span className="flex items-center gap-1.5">
                <span className="inline-block w-4 h-3 rounded-sm" style={{ background: 'rgba(74, 222, 128, 0.08)' }} />
                80% range
              </span>
            </>
          )}
          <span className="flex items-center gap-1.5">
            <span className="inline-block w-3 h-3 rounded-sm" style={{ background: 'rgba(239, 68, 68, 0.25)' }} />
            Departures
          </span>
        </div>

        <p className="text-[10px] text-muted-foreground text-center italic mt-1">
          {NUM_SIM_PATHS} simulations · {observedCount} observed data points
        </p>
      </DialogContent>
    </Dialog>
  );
};

/* ── Custom Tooltip ── */
const CustomTooltip: React.FC<any> = ({ active, payload, label }) => {
  if (!active || !payload || payload.length === 0) return null;

  const data = payload[0]?.payload;
  if (!data) return null;

  const minute = data.minute;
  const security = data.security;
  const median = data.median;
  const departures = data.departures;
  const bandInner = data.bandInner;
  const bandOuter = data.bandOuter;

  return (
    <div className="bg-gray-900/95 border border-gray-700 rounded-lg px-3 py-2 shadow-xl text-xs max-w-[180px]">
      <p className="text-gray-400 font-medium mb-1.5">Minute {minute}</p>

      {security !== null && (
        <div className="flex justify-between items-center gap-3 mb-0.5">
          <span className="text-green-400">Security</span>
          <span className="text-white font-semibold">{security}m</span>
        </div>
      )}

      {median !== null && security === null && (
        <>
          <div className="flex justify-between items-center gap-3 mb-0.5">
            <span className="text-green-400/70">Projected</span>
            <span className="text-white font-semibold">{median}m</span>
          </div>
          {bandInner && (
            <div className="flex justify-between items-center gap-3 mb-0.5">
              <span className="text-gray-500">50% range</span>
              <span className="text-gray-300">{bandInner[0]}–{bandInner[1]}m</span>
            </div>
          )}
          {bandOuter && (
            <div className="flex justify-between items-center gap-3 mb-0.5">
              <span className="text-gray-500">80% range</span>
              <span className="text-gray-300">{bandOuter[0]}–{bandOuter[1]}m</span>
            </div>
          )}
        </>
      )}

      {departures > 0 && (
        <div className="flex justify-between items-center gap-3 mt-1 pt-1 border-t border-gray-700">
          <span className="text-red-400">Departures</span>
          <span className="text-white font-semibold">{departures}</span>
        </div>
      )}
    </div>
  );
};

export default HourGraphDialog;

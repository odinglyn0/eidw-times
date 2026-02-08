import React, { useMemo, useState, useEffect, useCallback } from 'react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import {
  ResponsiveContainer, ComposedChart, Line, Area, XAxis, YAxis,
  CartesianGrid, Tooltip, ReferenceLine,
} from 'recharts';
import { parseISO, format, addMinutes, differenceInMinutes } from 'date-fns';
import { apiClient } from '@/integrations/api/client';
import { Slider } from '@/components/ui/slider';
import { Button } from '@/components/ui/button';
import { RotateCcw, Loader2, ChevronLeft, ChevronRight, Minus, Plus } from 'lucide-react';
import { cn } from '@/lib/utils';

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

const GRANULARITY_OPTIONS = [
  { label: '1m', value: 1 },
  { label: '5m', value: 5 },
  { label: '15m', value: 15 },
  { label: '30m', value: 30 },
  { label: '1h', value: 60 },
];

const PRESETS = [
  { label: '5m', minutes: 5 },
  { label: '15m', minutes: 15 },
  { label: '30m', minutes: 30 },
  { label: '1h', minutes: 60 },
  { label: '3h', minutes: 180 },
  { label: '6h', minutes: 360 },
  { label: '12h', minutes: 720 },
  { label: '1d', minutes: 1440 },
  { label: '3d', minutes: 4320 },
  { label: '7d', minutes: 10080 },
];

const MAX_PAST_MINUTES = 7 * 24 * 60;
const MAX_FUTURE_MINUTES = 1 * 24 * 60;

function sliderToDate(val: number): Date {
  const now = new Date();
  const offsetFromNow = val - MAX_PAST_MINUTES;
  return addMinutes(now, offsetFromNow);
}

function formatAxisDate(d: Date, spanMinutes: number): string {
  if (spanMinutes <= 60) return format(d, 'h:mm a');
  if (spanMinutes <= 1440) return format(d, 'h a');
  return format(d, 'MMM d, ha');
}

function bucketize(
  data: { ts: Date; value: number }[],
  startDate: Date,
  endDate: Date,
  granularityMinutes: number
): { ts: Date; avg: number | null }[] {
  const buckets: { ts: Date; avg: number | null }[] = [];
  let cursor = new Date(startDate);
  while (cursor < endDate) {
    const bucketEnd = addMinutes(cursor, granularityMinutes);
    const inBucket = data.filter(d => d.ts >= cursor && d.ts < bucketEnd);
    buckets.push({
      ts: new Date(cursor),
      avg: inBucket.length > 0
        ? Math.round(inBucket.reduce((s, d) => s + d.value, 0) / inBucket.length)
        : null,
    });
    cursor = bucketEnd;
  }
  return buckets;
}

const HourGraphDialog: React.FC<HourGraphDialogProps> = ({
  open, onOpenChange, terminalId, securityData: _securityData, departureData: _departureData, currentTime: _currentTime,
}) => {
  const defaultStart = MAX_PAST_MINUTES - 60;
  const defaultEnd = MAX_PAST_MINUTES;
  const [range, setRange] = useState<[number, number]>([defaultStart, defaultEnd]);
  const [granularity, setGranularity] = useState(1);
  const [loading, setLoading] = useState(false);
  const [rangeSecData, setRangeSecData] = useState<{ timestamp: string; t1: number | null; t2: number | null }[]>([]);
  const [rangeDepData, setRangeDepData] = useState<{ timestamp: string; count: number }[]>([]);
  const [activePreset, setActivePreset] = useState<number | null>(60);

  const startDate = useMemo(() => sliderToDate(range[0]), [range]);
  const endDate = useMemo(() => sliderToDate(range[1]), [range]);
  const spanMinutes = range[1] - range[0];
  const isFuture = range[1] > MAX_PAST_MINUTES;

  useEffect(() => {
    if (spanMinutes <= 30) setGranularity(1);
    else if (spanMinutes <= 180) setGranularity(1);
    else if (spanMinutes <= 720) setGranularity(5);
    else if (spanMinutes <= 2880) setGranularity(15);
    else if (spanMinutes <= 7200) setGranularity(30);
    else setGranularity(60);
  }, [spanMinutes]);

  const fetchRangeData = useCallback(async () => {
    setLoading(true);
    try {
      const s = sliderToDate(range[0]);
      const e = sliderToDate(range[1]);
      const now = new Date();
      const secFetchEnd = e > now ? now : e;
      const depFetchStart = s;
      const depFetchEnd = e;

      const promises: Promise<any>[] = [];
      if (s < secFetchEnd) {
        promises.push(apiClient.getRangeSecurityData(s.toISOString(), secFetchEnd.toISOString()));
      } else {
        promises.push(Promise.resolve([]));
      }
      promises.push(apiClient.getRangeDepartureData(terminalId.toString(), depFetchStart.toISOString(), depFetchEnd.toISOString()));

      const [secRes, depRes] = await Promise.all(promises);
      setRangeSecData(secRes);
      setRangeDepData(depRes);
    } catch (err) {
      console.error('Error fetching range data:', err);
    } finally {
      setLoading(false);
    }
  }, [range, terminalId]);

  useEffect(() => {
    if (open) {
      const timer = setTimeout(fetchRangeData, 300);
      return () => clearTimeout(timer);
    }
  }, [open, fetchRangeData]);

  const handleReset = () => {
    setRange([defaultStart, defaultEnd]);
    setActivePreset(60);
  };

  const applyPreset = (minutes: number) => {
    const halfBack = Math.min(minutes, MAX_PAST_MINUTES);
    const newStart = Math.max(0, MAX_PAST_MINUTES - halfBack);
    setRange([newStart, MAX_PAST_MINUTES]);
    setActivePreset(minutes);
  };

  const nudge = (direction: -1 | 1) => {
    const step = Math.max(1, Math.round(spanMinutes * 0.25));
    const newStart = Math.max(0, Math.min(range[0] + direction * step, MAX_PAST_MINUTES + MAX_FUTURE_MINUTES - spanMinutes));
    const newEnd = newStart + spanMinutes;
    setRange([newStart, Math.min(newEnd, MAX_PAST_MINUTES + MAX_FUTURE_MINUTES)]);
    setActivePreset(null);
  };

  const zoom = (direction: -1 | 1) => {
    const center = (range[0] + range[1]) / 2;
    const currentSpan = spanMinutes;
    const newSpan = direction === -1
      ? Math.max(5, Math.round(currentSpan * 0.5))
      : Math.min(MAX_PAST_MINUTES + MAX_FUTURE_MINUTES, Math.round(currentSpan * 2));
    const newStart = Math.max(0, Math.round(center - newSpan / 2));
    const newEnd = Math.min(MAX_PAST_MINUTES + MAX_FUTURE_MINUTES, newStart + newSpan);
    setRange([newStart, newEnd]);
    setActivePreset(null);
  };

  const baseChartData = useMemo(() => {
    const now = new Date();
    const tKey = `t${terminalId}` as 't1' | 't2';

    const secPoints = rangeSecData
      .filter(d => d[tKey] !== null)
      .map(d => ({ ts: parseISO(d.timestamp), value: d[tKey]! }));

    const depPoints = rangeDepData
      .filter(d => d.count !== null && d.count > 0)
      .map(d => ({ ts: parseISO(d.timestamp), value: d.count }));

    const secBuckets = bucketize(secPoints, startDate, endDate, granularity);
    const depBuckets = bucketize(depPoints, startDate, endDate, granularity);

    const points: Record<string, any>[] = [];
    const depMap = new Map(depBuckets.map(b => [b.ts.getTime(), b.avg]));

    for (const bucket of secBuckets) {
      const point: Record<string, any> = {
        ts: bucket.ts.getTime(),
        label: formatAxisDate(bucket.ts, spanMinutes),
        departures: depMap.get(bucket.ts.getTime()) || 0,
      };

      if (bucket.ts <= now) {
        point.security = bucket.avg;
      } else {
        point.security = null;
      }

      points.push(point);
    }

    return { points, secBuckets };
  }, [rangeSecData, rangeDepData, startDate, endDate, granularity, terminalId, spanMinutes]);

  const [projectionBands, setProjectionBands] = useState<Record<string, { p10: number; p25: number; median: number; p75: number; p90: number }>>({});
  const [projectionLoading, setProjectionLoading] = useState(false);

  useEffect(() => {
    if (!isFuture) {
      setProjectionBands({});
      return;
    }

    let cancelled = false;
    setProjectionLoading(true);

    const now = new Date();
    const futureMinutes = Math.round(differenceInMinutes(endDate, now));

    if (futureMinutes <= 0) {
      setProjectionBands({});
      setProjectionLoading(false);
      return;
    }

    apiClient.simulateGammaMethodA(
      terminalId,
      startDate.toISOString(),
      endDate.toISOString(),
      spanMinutes,
      NUM_SIM_PATHS
    )
      .then(data => {
        if (cancelled) return;
        setProjectionBands(data.bands || {});
      })
      .catch(() => {
        if (!cancelled) setProjectionBands({});
      })
      .finally(() => {
        if (!cancelled) setProjectionLoading(false);
      });

    return () => { cancelled = true; };
  }, [isFuture, terminalId, startDate, endDate, spanMinutes]);

  const chartData = useMemo(() => {
    const now = new Date();
    const points = baseChartData.points.map(p => ({ ...p }));

    const hasBands = Object.keys(projectionBands).length > 0;

    if (hasBands) {
      for (const point of points) {
        const pointDate = new Date(point.ts);
        if (pointDate > now) {
          const minutesFromNow = Math.round(differenceInMinutes(pointDate, now));
          const band = projectionBands[String(minutesFromNow)];
          if (band) {
            point.median = band.median;
            point.bandOuter = [band.p10, band.p90];
            point.bandInner = [band.p25, band.p75];
          }
        }
      }

      const lastActual = [...points].reverse().find(p => p.security !== null);
      const firstProjection = points.find(p => p.median !== undefined && p.median !== null);
      if (lastActual && firstProjection && lastActual !== firstProjection) {
        lastActual.median = lastActual.security;
        lastActual.bandOuter = [lastActual.security, lastActual.security];
        lastActual.bandInner = [lastActual.security, lastActual.security];
      }
    }

    return {
      points,
      hasProjection: hasBands,
      futureDepCount: 0,
    };
  }, [baseChartData, projectionBands]);

  const { points, hasProjection, futureDepCount } = chartData;

  const allSecValues = points.map(p => p.security).filter((v): v is number => v !== null);
  const allMedianValues = points.map(p => p.median).filter((v): v is number => v !== null);
  const allBandValues = points
    .flatMap(p => (p.bandOuter ? [p.bandOuter[0], p.bandOuter[1]] : []))
    .filter((v): v is number => v !== null);
  const allDepValues = points.map(p => p.departures).filter((v): v is number => v !== null);

  const maxSec = Math.max(...allSecValues, ...allMedianValues, ...allBandValues, 1);
  const maxDep = Math.max(...allDepValues, 1);

  const rangeLabel = useMemo(() => {
    const s = sliderToDate(range[0]);
    const e = sliderToDate(range[1]);
    const sameDay = format(s, 'yyyy-MM-dd') === format(e, 'yyyy-MM-dd');
    if (sameDay) {
      return `${format(s, 'MMM d')} · ${format(s, 'h:mm a')} – ${format(e, 'h:mm a')}`;
    }
    return `${format(s, 'MMM d, h:mm a')} – ${format(e, 'MMM d, h:mm a')}`;
  }, [range]);

  const nowTs = new Date().getTime();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl w-[97vw] max-h-[92vh] overflow-y-auto p-4 sm:p-6">
        <DialogHeader className="pb-1">
          <DialogTitle className="text-lg flex items-center gap-2">
            T{terminalId} Explorer
            {loading && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
          </DialogTitle>
          <DialogDescription className="text-xs">
            {rangeLabel} · {spanMinutes < 60 ? `${spanMinutes}m` : spanMinutes < 1440 ? `${Math.round(spanMinutes / 60)}h` : `${(spanMinutes / 1440).toFixed(1)}d`} span
            {isFuture && ' · includes forecast'}
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-wrap gap-1 mt-1">
          {PRESETS.map(p => (
            <Button
              key={p.label}
              variant={activePreset === p.minutes ? "default" : "outline"}
              size="sm"
              className={cn(
                "h-7 px-2.5 text-xs font-medium rounded-full transition-all",
                activePreset === p.minutes && "bg-green-600 hover:bg-green-700 text-white border-green-600"
              )}
              onClick={() => applyPreset(p.minutes)}
            >
              {p.label}
            </Button>
          ))}
          <Button
            variant="ghost"
            size="sm"
            className="h-7 px-2 text-xs ml-auto"
            onClick={handleReset}
            title="Reset to default (last hour)"
          >
            <RotateCcw className="h-3.5 w-3.5 mr-1" />
            Reset
          </Button>
        </div>

        <div className="mt-2 px-1">
          <div className="flex items-center justify-between text-[10px] text-muted-foreground mb-1">
            <span>-7 days</span>
            <span className="font-medium text-foreground">Now</span>
            <span>+1 day</span>
          </div>
          <div className="relative">
            <div
              className="absolute top-0 bottom-0 w-px bg-green-500/40 z-10 pointer-events-none"
              style={{ left: `${(MAX_PAST_MINUTES / (MAX_PAST_MINUTES + MAX_FUTURE_MINUTES)) * 100}%` }}
            />
            <Slider
              value={range}
              onValueChange={(v) => { setRange(v as [number, number]); setActivePreset(null); }}
              min={0}
              max={MAX_PAST_MINUTES + MAX_FUTURE_MINUTES}
              step={1}
              className="py-2"
            />
          </div>
          <div className="flex items-center justify-between text-[10px] text-muted-foreground mt-0.5">
            <span>{format(startDate, 'MMM d, h:mm a')}</span>
            <span>{format(endDate, 'MMM d, h:mm a')}</span>
          </div>
        </div>

        <div className="flex items-center gap-2 mt-1 flex-wrap">
          <div className="flex items-center gap-0.5">
            <Button variant="outline" size="icon" className="h-7 w-7" onClick={() => nudge(-1)} title="Pan left">
              <ChevronLeft className="h-3.5 w-3.5" />
            </Button>
            <Button variant="outline" size="icon" className="h-7 w-7" onClick={() => nudge(1)} title="Pan right">
              <ChevronRight className="h-3.5 w-3.5" />
            </Button>
          </div>

          <div className="flex items-center gap-0.5">
            <Button variant="outline" size="icon" className="h-7 w-7" onClick={() => zoom(-1)} title="Zoom in">
              <Plus className="h-3.5 w-3.5" />
            </Button>
            <Button variant="outline" size="icon" className="h-7 w-7" onClick={() => zoom(1)} title="Zoom out">
              <Minus className="h-3.5 w-3.5" />
            </Button>
          </div>

          <div className="flex items-center gap-1 ml-auto">
            <span className="text-[10px] text-muted-foreground">Granularity:</span>
            {GRANULARITY_OPTIONS.map(g => (
              <Button
                key={g.value}
                variant={granularity === g.value ? "default" : "ghost"}
                size="sm"
                className={cn(
                  "h-6 px-2 text-[10px] rounded-md",
                  granularity === g.value && "bg-green-600 hover:bg-green-700 text-white"
                )}
                onClick={() => setGranularity(g.value)}
              >
                {g.label}
              </Button>
            ))}
          </div>
        </div>

        <div className="h-[320px] w-full mt-1">
          {loading && points.length === 0 ? (
            <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
              <Loader2 className="h-5 w-5 animate-spin mr-2" /> Loading data...
            </div>
          ) : points.length === 0 ? (
            <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
              No data available for this range
            </div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={points} margin={{ top: 10, right: 10, left: 0, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} opacity={0.15} />
                <XAxis
                  dataKey="ts"
                  tickFormatter={(v) => formatAxisDate(new Date(v), spanMinutes)}
                  fontSize={10}
                  axisLine={false}
                  tickLine={false}
                  interval="preserveStartEnd"
                  minTickGap={50}
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
                  content={<CustomTooltip spanMinutes={spanMinutes} />}
                  cursor={{ stroke: 'rgba(255,255,255,0.15)', strokeWidth: 1 }}
                />

                {points.some(p => p.ts <= nowTs) && points.some(p => p.ts >= nowTs) && (
                  <ReferenceLine
                    x={nowTs}
                    yAxisId="security"
                    stroke="rgba(255,255,255,0.3)"
                    strokeDasharray="3 3"
                    strokeWidth={1}
                    label={{ value: 'Now', position: 'top', fontSize: 9, fill: 'rgba(255,255,255,0.5)' }}
                  />
                )}

                <Line
                  yAxisId="departures"
                  type="natural"
                  dataKey="departures"
                  stroke="#FF8000"
                  strokeWidth={2}
                  dot={false}
                  connectNulls={true}
                  isAnimationActive={false}
                />

                <Area
                  yAxisId="security"
                  type="monotone"
                  dataKey="bandOuter"
                  fill="rgba(74, 222, 128, 0.08)"
                  stroke="none"
                  connectNulls={true}
                  isAnimationActive={false}
                />

                <Area
                  yAxisId="security"
                  type="monotone"
                  dataKey="bandInner"
                  fill="rgba(74, 222, 128, 0.15)"
                  stroke="none"
                  connectNulls={true}
                  isAnimationActive={false}
                />

                <Line
                  yAxisId="security"
                  type="monotone"
                  dataKey="median"
                  stroke="rgba(74, 222, 128, 0.6)"
                  strokeWidth={2}
                  strokeDasharray="6 3"
                  dot={false}
                  connectNulls={true}
                  isAnimationActive={false}
                />

                <Line
                  yAxisId="security"
                  type="monotone"
                  dataKey="security"
                  stroke="#22c55e"
                  strokeWidth={2.5}
                  dot={false}
                  connectNulls={true}
                  activeDot={{ r: 3, fill: '#22c55e', stroke: '#fff', strokeWidth: 1.5 }}
                />
              </ComposedChart>
            </ResponsiveContainer>
          )}
        </div>

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
            <span className="inline-block w-5 h-[2.5px] rounded-full" style={{ background: '#FF8000' }} />
            Departures
          </span>
        </div>

        <p className="text-[10px] text-muted-foreground text-center italic mt-1">
          {allSecValues.length} data points · {granularity}m granularity
          {isFuture && futureDepCount > 0 && ` · ${futureDepCount} scheduled flights`}
          {range[1] > MAX_PAST_MINUTES && (
            <span className="text-yellow-500/70 ml-1">⚠ Future data is departure-weighted projection (AI coming soon!)</span>
          )}
        </p>
      </DialogContent>
    </Dialog>
  );
};

const CustomTooltip: React.FC<any> = ({ active, payload, spanMinutes }) => {
  if (!active || !payload || payload.length === 0) return null;

  const data = payload[0]?.payload;
  if (!data) return null;

  const ts = new Date(data.ts);
  const security = data.security;
  const median = data.median;
  const departures = data.departures;
  const bandInner = data.bandInner;
  const bandOuter = data.bandOuter;

  return (
    <div className="bg-gray-900/95 border border-gray-700 rounded-lg px-3 py-2 shadow-xl text-xs max-w-[200px]">
      <p className="text-gray-400 font-medium mb-1.5">
        {format(ts, spanMinutes <= 1440 ? 'h:mm a' : 'MMM d, h:mm a')}
      </p>

      {security !== null && (
        <div className="flex justify-between items-center gap-3 mb-0.5">
          <span className="text-green-400">Security</span>
          <span className="text-white font-semibold">{security}m</span>
        </div>
      )}

      {median !== null && median !== undefined && security === null && (
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
          <span className="text-orange-400">Departures</span>
          <span className="text-white font-semibold">{departures}</span>
        </div>
      )}
    </div>
  );
};

export default HourGraphDialog;

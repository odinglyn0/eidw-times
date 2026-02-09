import React, { useState, useMemo, useEffect } from 'react';
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/PopO";
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid } from 'recharts';
import { format, parseISO, getMinutes, getHours } from 'date-fns';
import { Loader2 } from 'lucide-react';
import { apiClient } from '@/integrations/api/client';

const simulationCache = new Map<string, { data: { projected: { minute: number; value: number }[] }; expiry: number }>();
const CACHE_TTL_MS = 2 * 60 * 1000;

interface HourlySecurityData {
  hour: number;
  t1: number | null;
  t2: number | null;
  timestamp: string | null;
  colorClass?: string;
  displayValue?: number | null;
}

interface GranularSecurityData {
  timestamp: string;
  time: number | null;
}

interface ChartDataPoint {
  minute: number;
  actual: number | null;
  projected: number | null;
}

interface HourlyDetailPopoverProps {
  children: React.ReactNode;
  all24HourData: HourlySecurityData[];
  currentDataPoint: HourlySecurityData;
  terminalId: 1 | 2;
  granularDataForHour: GranularSecurityData[];
  isLoadingGranularData: boolean;
}

const HourlyDetailPopover: React.FC<HourlyDetailPopoverProps> = ({ children, all24HourData, currentDataPoint, terminalId, granularDataForHour, isLoadingGranularData }) => {
  const [isPopoverOpen, setIsPopoverOpen] = useState(false);

  const currentIndex = all24HourData.findIndex(d => d.timestamp === currentDataPoint.timestamp);
  const prevDataPoint = currentIndex > 0 ? all24HourData[currentIndex - 1] : null;
  const nextDataPoint = currentIndex < all24HourData.length - 1 ? all24HourData[currentIndex + 1] : null;

  const currentTime = currentDataPoint.displayValue ?? currentDataPoint[`t${terminalId}` as 't1' | 't2'];

  const stats = useMemo(() => {
    const currentTime = currentDataPoint.displayValue ?? currentDataPoint[`t${terminalId}` as 't1' | 't2'];
    const prevTime = prevDataPoint
      ? (prevDataPoint.displayValue ?? prevDataPoint[`t${terminalId}` as 't1' | 't2'])
      : null;
    const nextTime = nextDataPoint
      ? (nextDataPoint.displayValue ?? nextDataPoint[`t${terminalId}` as 't1' | 't2'])
      : null;

    let changeFromPrev: string | null = null;
    if (currentTime !== null && currentTime !== undefined && prevTime !== null && prevTime !== undefined) {
      if (prevTime === 0 && currentTime === 0) {
        changeFromPrev = "No change from previous point (0m)";
      } else if (prevTime === 0) {
        changeFromPrev = `Increased from 0m to ${currentTime}m`;
      } else {
        const pct = ((currentTime - prevTime) / prevTime) * 100;
        changeFromPrev = `${pct > 0 ? 'Up' : 'Down'} ${Math.abs(pct).toFixed(0)}% from previous point`;
      }
    } else if (currentTime !== null && currentTime !== undefined && (prevTime === null || prevTime === undefined)) {
      changeFromPrev = "No data for previous point";
    }

    let changeToNext: string | null = null;
    if (currentTime !== null && currentTime !== undefined && nextTime !== null && nextTime !== undefined) {
      if (currentTime === 0 && nextTime === 0) {
        changeToNext = "No change to next point (0m)";
      } else if (currentTime === 0) {
        changeToNext = `Increased from 0m to ${nextTime}m`;
      } else {
        const pct = ((nextTime - currentTime) / currentTime) * 100;
        changeToNext = `${pct > 0 ? 'Up' : 'Down'} ${Math.abs(pct).toFixed(0)}% to next point`;
      }
    } else if (currentTime !== null && currentTime !== undefined && (nextTime === null || nextTime === undefined)) {
      changeToNext = "No data for next point";
    }

    let fluctuationMessage: string | null = null;
    const validTimes = granularDataForHour.map(d => d.time).filter((t): t is number => t !== null);
    if (validTimes.length > 1) {
      const minT = Math.min(...validTimes);
      const maxT = Math.max(...validTimes);
      const range = maxT - minT;
      if (minT === 0 && maxT === 0) {
        fluctuationMessage = "No fluctuation (0m)";
      } else if (minT === 0) {
        fluctuationMessage = `Fluctuated by ${range}m (from 0m)`;
      } else {
        const pct = (range / minT) * 100;
        fluctuationMessage = `Fluctuated by ${range}m (${pct.toFixed(0)}%) within the hour`;
      }
    } else if (validTimes.length === 1) {
      fluctuationMessage = `Only one data point (${validTimes[0]}m)`;
    } else {
      fluctuationMessage = "No data for fluctuation";
    }

    return { changeFromPrev, changeToNext, fluctuationMessage };
  }, [currentDataPoint, prevDataPoint, nextDataPoint, terminalId, granularDataForHour]);

  const isCurrentHour = currentDataPoint.timestamp
    ? getHours(parseISO(currentDataPoint.timestamp)) === getHours(new Date())
      && parseISO(currentDataPoint.timestamp).toDateString() === new Date().toDateString()
    : false;

  const currentMinuteNow = new Date().getMinutes();

  const [chartData, setChartData] = useState<ChartDataPoint[]>([]);

  const staticChartData = useMemo(() => {
    const validGranular = granularDataForHour.filter(d => d.time !== null);
    if (validGranular.length === 0) return { points: [] as ChartDataPoint[], needsProjection: false };

    const observedByMinute = new Map<number, number>();
    validGranular.forEach(d => {
      const m = getMinutes(parseISO(d.timestamp));
      observedByMinute.set(m, d.time!);
    });

    if (!isCurrentHour) {
      const points: ChartDataPoint[] = [];
      const sortedMinutes = Array.from(observedByMinute.keys()).sort((a, b) => a - b);
      sortedMinutes.forEach(m => { points.push({ minute: m, actual: observedByMinute.get(m)!, projected: null }); });
      return { points, needsProjection: false };
    }

    const observedValues = Array.from(observedByMinute.entries())
      .filter(([m]) => m <= currentMinuteNow)
      .sort(([a], [b]) => a - b);

    const points: ChartDataPoint[] = [];
    observedValues.forEach(([m, v]) => { points.push({ minute: m, actual: v, projected: null }); });

    return { points, needsProjection: observedValues.length > 0 };
  }, [granularDataForHour, isCurrentHour, currentMinuteNow]);

  useEffect(() => {
    if (!staticChartData.needsProjection) {
      setChartData(staticChartData.points);
      return;
    }
    if (!isPopoverOpen) return;

    const hourTimestamp = currentDataPoint.timestamp || undefined;
    const cacheKey = `${terminalId}_${hourTimestamp}`;
    const cached = simulationCache.get(cacheKey);

    if (cached && cached.expiry > Date.now()) {
      const projected = cached.data.projected;
      const points = [...staticChartData.points];
      if (points.length > 0) points[points.length - 1].projected = points[points.length - 1].actual;
      projected.forEach(p => { points.push({ minute: p.minute, actual: null, projected: p.value }); });
      setChartData(points);
      return;
    }

    let cancelled = false;

    apiClient.simulateTangoMethodA(terminalId, hourTimestamp)
      .then(data => {
        if (cancelled) return;
        simulationCache.set(cacheKey, { data, expiry: Date.now() + CACHE_TTL_MS });
        const projected = data.projected as { minute: number; value: number }[];
        const points = [...staticChartData.points];
        if (points.length > 0) points[points.length - 1].projected = points[points.length - 1].actual;
        projected.forEach(p => { points.push({ minute: p.minute, actual: null, projected: p.value }); });
        setChartData(points);
      })
      .catch(() => { if (!cancelled) setChartData(staticChartData.points); });

    return () => { cancelled = true; };
  }, [staticChartData, isPopoverOpen]);

  const allChartValues = chartData.flatMap(d => [d.actual, d.projected]).filter((v): v is number => v !== null);
  const minY = allChartValues.length > 0 ? Math.min(...allChartValues) : 0;
  const maxY = allChartValues.length > 0 ? Math.max(...allChartValues) : 10;
  const yAxisDomain = [minY > 0 ? minY - 2 : 0, maxY + 2];

  const formatTime = (isoString: string) => {
    const date = parseISO(isoString);
    return getMinutes(date) === 0 ? format(date, 'h a') : format(date, 'h:mm a');
  };

  return (
    <Popover open={isPopoverOpen} onOpenChange={setIsPopoverOpen}>
      <PopoverTrigger asChild>
        <div onMouseEnter={() => setIsPopoverOpen(true)} onMouseLeave={() => setIsPopoverOpen(false)}>
          {children}
        </div>
      </PopoverTrigger>
      <PopoverContent className="w-64 p-3 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg shadow-lg text-sm">
        <h4 className="font-semibold mb-2 text-center">Time: {currentDataPoint.timestamp ? formatTime(currentDataPoint.timestamp) : 'N/A'}</h4>
        {currentTime === null ? (
          <p className="text-center text-muted-foreground text-sm py-4">No data for this hour.</p>
        ) : (
        <>
        <div className="h-24 w-full mb-2">
          {isLoadingGranularData ? (
            <div className="flex items-center justify-center h-full"><Loader2 className="h-5 w-5 animate-spin mr-2" />Loading graph...</div>
          ) : chartData.length > 0 ? (
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData} margin={{ top: 5, right: 5, left: 5, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="minute" tickFormatter={(value) => `${value}m`} axisLine={false} tickLine={false} fontSize={10} domain={[0, 59]} />
                <YAxis tickFormatter={(value) => `${value}m`} axisLine={false} tickLine={false} fontSize={10} domain={yAxisDomain} />
                <Tooltip formatter={(value: number, name: string) => { const label = name === 'projected' ? 'Projected' : 'Actual'; return [`${value}m`, label]; }} labelFormatter={(label) => `Minute ${label}`} />
                <Line type="natural" dataKey="actual" stroke="#4CAF50" strokeWidth={2} dot={false} connectNulls={false} />
                {isCurrentHour && <Line type="natural" dataKey="projected" stroke="#4CAF50" strokeWidth={2} strokeDasharray="4 3" strokeOpacity={0.5} dot={false} connectNulls={false} />}
              </LineChart>
            </ResponsiveContainer>
          ) : (
            <p className="text-center text-muted-foreground text-xs mt-8">No granular data for graph.</p>
          )}
        </div>
        {isCurrentHour && chartData.some(d => d.projected !== null) && (
          <p className="text-xs text-muted-foreground text-center mb-1 italic">Dashed line = Simulated</p>
        )}
        <div className="space-y-1 text-gray-700 dark:text-gray-300">
            <>
              {stats.changeFromPrev && <p>{stats.changeFromPrev}</p>}
              {stats.changeToNext && <p>{stats.changeToNext}</p>}
              {stats.fluctuationMessage && <p>{stats.fluctuationMessage}</p>}
              {(!stats.changeFromPrev && !stats.changeToNext && !stats.fluctuationMessage) && <p>No comparative data available.</p>}
            </>
        </div>
        </>
        )}
      </PopoverContent>
    </Popover>
  );
};

export default HourlyDetailPopover;

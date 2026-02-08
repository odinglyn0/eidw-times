import React, { useState, useMemo } from 'react';
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid } from 'recharts';
import { format, parseISO, getMinutes, getHours } from 'date-fns';
import { Loader2 } from 'lucide-react';

interface HourlySecurityData {
  hour: number;
  t1: number | null;
  t2: number | null;
  timestamp: string | null;
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

/**
 * Monte Carlo projection: given observed security times, simulate future minutes.
 * Uses a mean-reverting random walk with observed mean/stddev.
 * Runs `numSims` paths and returns the median at each future minute.
 */
function monteCarloProject(
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
  const meanReversion = 0.3; // strength of pull toward mean

  const futureMinutes: number[] = [];
  for (let m = lastMinute + 1; m <= 59; m++) futureMinutes.push(m);
  if (futureMinutes.length === 0) return [];

  // Run simulations
  const allPaths: number[][] = [];
  for (let sim = 0; sim < numSims; sim++) {
    const path: number[] = [];
    let current = lastValue;
    for (let i = 0; i < futureMinutes.length; i++) {
      // Box-Muller for normal random
      const u1 = Math.random();
      const u2 = Math.random();
      const z = Math.sqrt(-2 * Math.log(u1 || 0.001)) * Math.cos(2 * Math.PI * u2);
      // Mean-reverting step
      const drift = meanReversion * (mean - current);
      current = current + drift + stddev * 0.3 * z;
      path.push(Math.max(0, Math.round(current)));
    }
    allPaths.push(path);
  }

  // Take median at each future minute
  const result: { minute: number; value: number }[] = [];
  for (let i = 0; i < futureMinutes.length; i++) {
    const values = allPaths.map(p => p[i]).sort((a, b) => a - b);
    const median = values[Math.floor(values.length / 2)];
    result.push({ minute: futureMinutes[i], value: median });
  }
  return result;
}

const HourlyDetailPopover: React.FC<HourlyDetailPopoverProps> = ({ children, all24HourData, currentDataPoint, terminalId, granularDataForHour, isLoadingGranularData }) => {
  const dataKey = `t${terminalId}` as 't1' | 't2';
  const [isPopoverOpen, setIsPopoverOpen] = useState(false);

  const currentIndex = all24HourData.findIndex(d => d.timestamp === currentDataPoint.timestamp);
  const prevDataPoint = currentIndex > 0 ? all24HourData[currentIndex - 1] : null;
  const nextDataPoint = currentIndex < all24HourData.length - 1 ? all24HourData[currentIndex + 1] : null;

  const currentTime = currentDataPoint[dataKey];
  const prevTime = prevDataPoint ? prevDataPoint[dataKey] : null;
  const nextTime = nextDataPoint ? nextDataPoint[dataKey] : null;

  let changeFromLastPoint: string | null = null;
  if (currentTime !== null && prevTime !== null) {
    if (prevTime === 0 && currentTime === 0) {
      changeFromLastPoint = `No change from previous point (0m)`;
    } else if (prevTime === 0) {
      changeFromLastPoint = `Increased from 0m to ${currentTime}m`;
    } else {
      const percentage = ((currentTime - prevTime) / prevTime) * 100;
      changeFromLastPoint = `${percentage > 0 ? 'Up' : 'Down'} ${Math.abs(percentage).toFixed(0)}% from previous point`;
    }
  } else if (currentTime !== null && prevTime === null) {
    changeFromLastPoint = `No data for previous point`;
  }

  let changeToNextPoint: string | null = null;
  if (currentTime !== null && nextTime !== null) {
    if (currentTime === 0 && nextTime === 0) {
      changeToNextPoint = `No change to next point (0m)`;
    } else if (currentTime === 0) {
      changeToNextPoint = `Increased from 0m to ${nextTime}m`;
    } else {
      const percentage = ((nextTime - currentTime) / currentTime) * 100;
      changeToNextPoint = `${percentage > 0 ? 'Up' : 'Down'} ${Math.abs(percentage).toFixed(0)}% to next point`;
    }
  } else if (currentTime !== null && nextTime === null) {
    changeToNextPoint = `No data for next point`;
  }

  let fluctuationMessage: string | null = null;
  if (granularDataForHour.length > 0 && granularDataForHour.some(d => d.time !== null)) {
    const validTimes = granularDataForHour.map(d => d.time).filter((t): t is number => t !== null);
    if (validTimes.length > 1) {
      const minTime = Math.min(...validTimes);
      const maxTime = Math.max(...validTimes);
      const range = maxTime - minTime;
      if (minTime === 0 && maxTime === 0) {
        fluctuationMessage = `No fluctuation (0m)`;
      } else if (minTime === 0) {
        fluctuationMessage = `Fluctuated by ${range}m (from 0m)`;
      } else {
        const percentageFluctuation = (range / minTime) * 100;
        fluctuationMessage = `Fluctuated by ${range}m (${percentageFluctuation.toFixed(0)}%) within the hour`;
      }
    } else if (validTimes.length === 1) {
      fluctuationMessage = `Only one data point (${validTimes[0]}m)`;
    }
  } else {
    fluctuationMessage = `No data for fluctuation`;
  }

  // Determine if this is the current hour
  const isCurrentHour = currentDataPoint.timestamp
    ? getHours(parseISO(currentDataPoint.timestamp)) === getHours(new Date())
      && parseISO(currentDataPoint.timestamp).toDateString() === new Date().toDateString()
    : false;

  const currentMinuteNow = new Date().getMinutes();

  // Build chart data: full 0-59 minute range with actual + projected lines
  const chartData: ChartDataPoint[] = useMemo(() => {
    const validGranular = granularDataForHour.filter(d => d.time !== null);
    if (validGranular.length === 0) return [];

    // Map observed data by minute
    const observedByMinute = new Map<number, number>();
    validGranular.forEach(d => {
      const m = getMinutes(parseISO(d.timestamp));
      observedByMinute.set(m, d.time!);
    });

    if (!isCurrentHour) {
      // Past hour: just show actual data across full range, no projection
      const points: ChartDataPoint[] = [];
      const sortedMinutes = Array.from(observedByMinute.keys()).sort((a, b) => a - b);
      sortedMinutes.forEach(m => {
        points.push({ minute: m, actual: observedByMinute.get(m)!, projected: null });
      });
      return points;
    }

    // Current hour: split into actual (up to now) and projected (future)
    const observedValues = Array.from(observedByMinute.entries())
      .filter(([m]) => m <= currentMinuteNow)
      .sort(([a], [b]) => a - b);

    const allObservedTimes = observedValues.map(([, v]) => v);
    const lastObserved = observedValues.length > 0 ? observedValues[observedValues.length - 1] : null;

    // Run Monte Carlo projection
    const projected = lastObserved
      ? monteCarloProject(allObservedTimes, lastObserved[1], lastObserved[0])
      : [];

    const points: ChartDataPoint[] = [];

    // Actual data points
    observedValues.forEach(([m, v]) => {
      points.push({ minute: m, actual: v, projected: null });
    });

    // Bridge point: last actual value also starts the projected line
    if (lastObserved) {
      // Update the last actual point to also have projected value for continuity
      const lastIdx = points.length - 1;
      if (lastIdx >= 0) {
        points[lastIdx].projected = points[lastIdx].actual;
      }
    }

    // Projected data points
    projected.forEach(p => {
      points.push({ minute: p.minute, actual: null, projected: p.value });
    });

    return points;
  }, [granularDataForHour, isCurrentHour, currentMinuteNow]);

  // Y-axis domain from all values (actual + projected)
  const allChartValues = chartData
    .flatMap(d => [d.actual, d.projected])
    .filter((v): v is number => v !== null);
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
        <div
          onMouseEnter={() => setIsPopoverOpen(true)}
          onMouseLeave={() => setIsPopoverOpen(false)}
        >
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
            <div className="flex items-center justify-center h-full">
              <Loader2 className="h-5 w-5 animate-spin mr-2" />
              Loading graph...
            </div>
          ) : chartData.length > 0 ? (
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData} margin={{ top: 5, right: 5, left: 5, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis
                  dataKey="minute"
                  tickFormatter={(value) => `${value}m`}
                  axisLine={false}
                  tickLine={false}
                  fontSize={10}
                  domain={[0, 59]}
                />
                <YAxis
                  tickFormatter={(value) => `${value}m`}
                  axisLine={false}
                  tickLine={false}
                  fontSize={10}
                  domain={yAxisDomain}
                />
                <Tooltip
                  formatter={(value: number, name: string) => {
                    const label = name === 'projected' ? 'Projected' : 'Actual';
                    return [`${value}m`, label];
                  }}
                  labelFormatter={(label) => `Minute ${label}`}
                />
                <Line
                  type="natural"
                  dataKey="actual"
                  stroke="#4CAF50"
                  strokeWidth={2}
                  dot={false}
                  connectNulls={false}
                />
                {isCurrentHour && (
                  <Line
                    type="natural"
                    dataKey="projected"
                    stroke="#4CAF50"
                    strokeWidth={2}
                    strokeDasharray="4 3"
                    strokeOpacity={0.5}
                    dot={false}
                    connectNulls={false}
                  />
                )}
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
          {changeFromLastPoint && <p>{changeFromLastPoint}</p>}
          {changeToNextPoint && <p>{changeToNextPoint}</p>}
          {fluctuationMessage && <p>{fluctuationMessage}</p>}
          {(changeFromLastPoint === null && changeToNextPoint === null && fluctuationMessage === null) && (
            <p>No comparative data available.</p>
          )}
        </div>
        </>
        )}
      </PopoverContent>
    </Popover>
  );
};

export default HourlyDetailPopover;

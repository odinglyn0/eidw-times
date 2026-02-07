import React, { useState, useEffect } from 'react';
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid } from 'recharts';
import { cn } from '@/lib/utils';
import { apiClient } from "@/integrations/api/client";
import { format, parseISO, getMinutes, getHours } from 'date-fns';
import { Loader2 } from 'lucide-react';

// Re-using the HourlySecurityData interface from TerminalSecurityCard for consistency
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

interface HourlyDetailPopoverProps {
  children: React.ReactNode;
  all24HourData: HourlySecurityData[]; // Renamed from hourlyData to be clearer
  currentDataPoint: HourlySecurityData; // The specific data point this popover is for
  terminalId: 1 | 2;
  granularDataForHour: GranularSecurityData[];
  isLoadingGranularData: boolean;
}

const HourlyDetailPopover: React.FC<HourlyDetailPopoverProps> = ({ children, all24HourData, currentDataPoint, terminalId, granularDataForHour, isLoadingGranularData }) => {
  const dataKey = `t${terminalId}` as 't1' | 't2';
  const [isPopoverOpen, setIsPopoverOpen] = useState(false);

  // Find the index of the current data point in the full 24-hour array
  const currentIndex = all24HourData.findIndex(d => d.timestamp === currentDataPoint.timestamp);

  // Get previous and next data points based on index
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

  // Calculate fluctuation within the hour (this logic remains the same as it uses granularDataForHour)
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
    } else {
      fluctuationMessage = `No data points for fluctuation`;
    }
  } else {
    fluctuationMessage = `No data for fluctuation`;
  }

  // Determine Y-axis domain for the granular graph
  const allTimesInGraph = granularDataForHour.map(d => d.time).filter((t): t is number => t !== null);
  const minY = allTimesInGraph.length > 0 ? Math.min(...allTimesInGraph) : 0;
  const maxY = allTimesInGraph.length > 0 ? Math.max(...allTimesInGraph) : 10; // Default max if no data
  const yAxisDomain = [minY > 0 ? minY - 5 : 0, maxY + 5]; // Add some padding

  // Helper function to format time
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
          {isLoadingGranularData ? ( // Use the prop for loading
            <div className="flex items-center justify-center h-full">
              <Loader2 className="h-5 w-5 animate-spin mr-2" />
              Loading graph...
            </div>
          ) : granularDataForHour.length > 0 && granularDataForHour.some(d => d.time !== null) ? (
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={granularDataForHour.filter(d => d.time !== null)} margin={{ top: 5, right: 5, left: 5, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis
                  dataKey="timestamp"
                  tickFormatter={(value) => `${getMinutes(parseISO(value))}m`}
                  axisLine={false}
                  tickLine={false}
                  fontSize={10}
                />
                <YAxis
                  tickFormatter={(value) => `${value}m`}
                  axisLine={false}
                  tickLine={false}
                  fontSize={10}
                  domain={yAxisDomain}
                />
                <Tooltip
                  formatter={(value: number, name: string, props: any) => {
                    const ts = props?.payload?.timestamp;
                    if (!ts || isNaN(parseISO(ts).getTime())) return [`${value}m`, 'Unknown time'];
                    return [`${value}m`, `Time ${formatTime(ts)}`];
                  }}
                  labelFormatter={(label) => {
                    if (!label || isNaN(parseISO(label).getTime())) return 'Unknown time';
                    return `Time ${formatTime(label)}`;
                  }}
                />
                <Line
                  type="monotone"
                  dataKey="time"
                  stroke="#4CAF50" // Consistent green for the graph line
                  strokeWidth={2}
                  dot={false} // This will hide the individual data points
                />
              </LineChart>
            </ResponsiveContainer>
          ) : (
            <p className="text-center text-muted-foreground text-xs mt-8">No granular data for graph.</p>
          )}
        </div>
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
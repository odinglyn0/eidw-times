import React, { useState, useEffect } from 'react';
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid } from 'recharts';
import { cn } from '@/lib/utils';
import { supabase } from "@/integrations/supabase/client";
import { format, parseISO, getMinutes } from 'date-fns';
import { Loader2 } from 'lucide-react';

interface HourlySecurityData {
  hour: number;
  t1: number | null;
  t2: number | null;
}

interface GranularSecurityData {
  timestamp: string;
  time: number | null;
}

interface HourlyDetailPopoverProps {
  children: React.ReactNode;
  hourlyData: HourlySecurityData[]; // All hourly data for the day (for percentage changes)
  currentHour: number; // The hour this popover is for
  terminalId: 1 | 2;
  dateString: string; // The date for which to fetch granular data (e.g., "2024-07-26")
}

const HourlyDetailPopover: React.FC<HourlyDetailPopoverProps> = ({ children, hourlyData, currentHour, terminalId, dateString }) => {
  const dataKey = `t${terminalId}` as 't1' | 't2';
  const [granularData, setGranularData] = useState<GranularSecurityData[]>([]);
  const [loadingGranularData, setLoadingGranularData] = useState(false);
  const [isPopoverOpen, setIsPopoverOpen] = useState(false);

  useEffect(() => {
    if (isPopoverOpen) {
      const fetchGranularData = async () => {
        setLoadingGranularData(true);
        try {
          const targetTimestamp = `${dateString}T${String(currentHour).padStart(2, '0')}:00:00Z`;
          console.log(`Fetching granular data for T${terminalId} at hour ${currentHour} on ${dateString}`);
          const { data, error: edgeFunctionError } = await supabase.functions.invoke('get-hourly-interval-security-data', {
            body: JSON.stringify({ terminalId, targetTimestamp }),
          });

          if (edgeFunctionError) {
            console.error(`Edge Function 'get-hourly-interval-security-data' error:`, edgeFunctionError);
            throw edgeFunctionError;
          }
          setGranularData(data as GranularSecurityData[]);
        } catch (err) {
          console.error("Error fetching granular data:", err);
          setGranularData([]);
        } finally {
          setLoadingGranularData(false);
        }
      };
      fetchGranularData();
    } else {
      setGranularData([]); // Clear data when popover closes
    }
  }, [isPopoverOpen, terminalId, currentHour, dateString]);

  // Calculate percentage changes using the hourlyData prop
  const currentHourData = hourlyData.find(d => d.hour === currentHour);
  const prevHourData = hourlyData.find(d => d.hour === currentHour - 1);
  const nextHourData = hourlyData.find(d => d.hour === currentHour + 1);

  const currentTime = currentHourData ? currentHourData[dataKey] : null;
  const prevTime = prevHourData ? prevHourData[dataKey] : null;
  const nextTime = nextHourData ? nextHourData[dataKey] : null;

  let changeFromLastHour: string | null = null;
  if (currentTime !== null && prevTime !== null) {
    if (prevTime === 0 && currentTime === 0) {
      changeFromLastHour = `No change from last hour (0m)`;
    } else if (prevTime === 0) {
      changeFromLastHour = `Increased from 0m to ${currentTime}m`;
    } else {
      const percentage = ((currentTime - prevTime) / prevTime) * 100;
      changeFromLastHour = `${percentage > 0 ? 'Up' : 'Down'} ${Math.abs(percentage).toFixed(0)}% from last hour`;
    }
  } else if (currentTime !== null && prevTime === null) {
    changeFromLastHour = `No data for previous hour`;
  }

  let changeToNextHour: string | null = null;
  if (currentTime !== null && nextTime !== null) {
    if (currentTime === 0 && nextTime === 0) {
      changeToNextHour = `No change to next hour (0m)`;
    } else if (currentTime === 0) {
      changeToNextHour = `Increased from 0m to ${nextTime}m`;
    } else {
      const percentage = ((nextTime - currentTime) / currentTime) * 100;
      changeToNextHour = `${percentage > 0 ? 'Up' : 'Down'} ${Math.abs(percentage).toFixed(0)}% to next hour`;
    }
  } else if (currentTime !== null && nextTime === null) {
    changeToNextHour = `No data for next hour`;
  }

  // Calculate fluctuation within the hour
  let fluctuationMessage: string | null = null;
  if (granularData.length > 0 && granularData.some(d => d.time !== null)) {
    const validTimes = granularData.map(d => d.time).filter((t): t is number => t !== null);
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
  const allTimesInGraph = granularData.map(d => d.time).filter((t): t is number => t !== null);
  const minY = allTimesInGraph.length > 0 ? Math.min(...allTimesInGraph) : 0;
  const maxY = allTimesInGraph.length > 0 ? Math.max(...allTimesInGraph) : 10; // Default max if no data
  const yAxisDomain = [minY > 0 ? minY - 5 : 0, maxY + 5]; // Add some padding

  return (
    <Popover open={isPopoverOpen} onOpenChange={setIsPopoverOpen}>
      <PopoverTrigger asChild>{children}</PopoverTrigger>
      <PopoverContent className="w-64 p-3 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg shadow-lg text-sm">
        <h4 className="font-semibold mb-2 text-center">Hour {currentHour}:00 - {currentHour + 1}:00</h4>
        <div className="h-24 w-full mb-2">
          {loadingGranularData ? (
            <div className="flex items-center justify-center h-full">
              <Loader2 className="h-5 w-5 animate-spin mr-2" />
              Loading graph...
            </div>
          ) : granularData.length > 0 && granularData.some(d => d.time !== null) ? (
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={granularData} margin={{ top: 5, right: 5, left: 5, bottom: 5 }}>
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
                  formatter={(value: number, name: string, props: any) => [`${value}m`, `Time ${format(parseISO(props.payload.timestamp), 'HH:mm')}`]}
                  labelFormatter={(label) => `Time ${format(parseISO(label), 'HH:mm')}`}
                />
                <Line
                  type="monotone"
                  dataKey="time"
                  stroke="#4CAF50" // Consistent green for the graph line
                  strokeWidth={2}
                  dot={true}
                />
              </LineChart>
            </ResponsiveContainer>
          ) : (
            <p className="text-center text-muted-foreground text-xs mt-8">No granular data for graph.</p>
          )}
        </div>
        <div className="space-y-1 text-gray-700 dark:text-gray-300">
          {changeFromLastHour && <p>{changeFromLastHour}</p>}
          {changeToNextHour && <p>{changeToNextHour}</p>}
          {fluctuationMessage && <p>{fluctuationMessage}</p>}
          {(changeFromLastHour === null && changeToNextHour === null && fluctuationMessage === null) && (
            <p>No comparative data available.</p>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
};

export default HourlyDetailPopover;
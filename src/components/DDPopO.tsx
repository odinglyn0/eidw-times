import React, { useState } from 'react';
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/PopO";
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid } from 'recharts';
import { cn } from '@/lib/utils';
import { format, parseISO, getMinutes } from 'date-fns';
import { Loader2 } from 'lucide-react';

interface HourlyDepartureDisplayData {
  date: string;
  hours: { value: number; colorClass: string }[];
}

interface GranularDepartureData {
  timestamp: string;
  count: number | null;
}

interface DepartureDetailPopoverProps {
  children: React.ReactNode;
  dailyDepartureData: HourlyDepartureDisplayData[];
  currentDateString: string;
  currentHour: number;
  terminalId: 1 | 2;
  granularDataForHour: GranularDepartureData[];
  isLoadingGranularData: boolean;
}

const DepartureDetailPopover: React.FC<DepartureDetailPopoverProps> = ({
  children,
  dailyDepartureData,
  currentDateString,
  currentHour,
  terminalId,
  granularDataForHour,
  isLoadingGranularData,
}) => {
  const [isPopoverOpen, setIsPopoverOpen] = useState(false);

  const currentDayData = dailyDepartureData.find(d => d.date === currentDateString);
  const currentHourDeparture = currentDayData?.hours.find((_, idx) => idx === currentHour)?.value || null;

  const prevHourDeparture = currentHour > 0 ? currentDayData?.hours[currentHour - 1]?.value || null : null;
  const nextHourDeparture = currentHour < 23 ? currentDayData?.hours[currentHour + 1]?.value || null : null;

  let changeFromLastHour: string | null = null;
  if (currentHourDeparture !== null && prevHourDeparture !== null) {
    if (prevHourDeparture === 0 && currentHourDeparture === 0) {
      changeFromLastHour = `No change from last hour (0 departures)`;
    } else if (prevHourDeparture === 0) {
      changeFromLastHour = `Increased from 0 to ${currentHourDeparture} departures`;
    } else {
      const percentage = ((currentHourDeparture - prevHourDeparture) / prevHourDeparture) * 100;
      changeFromLastHour = `${percentage > 0 ? 'Up' : 'Down'} ${Math.abs(percentage).toFixed(0)}% from last hour`;
    }
  } else if (currentHourDeparture !== null && prevHourDeparture === null) {
    changeFromLastHour = `No data for previous hour`;
  }

  let changeToNextHour: string | null = null;
  if (currentHourDeparture !== null && nextHourDeparture !== null) {
    if (currentHourDeparture === 0 && nextHourDeparture === 0) {
      changeToNextHour = `No change to next hour (0 departures)`;
    } else if (currentHourDeparture === 0) {
      changeToNextHour = `Increased from 0 to ${nextHourDeparture} departures`;
    } else {
      const percentage = ((nextHourDeparture - currentHourDeparture) / currentHourDeparture) * 100;
      changeToNextHour = `${percentage > 0 ? 'Up' : 'Down'} ${Math.abs(percentage).toFixed(0)}% to next hour`;
    }
  } else if (currentHourDeparture !== null && nextHourDeparture === null) {
    changeToNextHour = `No data for next hour`;
  }

  let fluctuationMessage: string | null = null;
  if (granularDataForHour.length > 0 && granularDataForHour.some(d => d.count !== null)) {
    const validCounts = granularDataForHour.map(d => d.count).filter((c): c is number => c !== null);
    if (validCounts.length > 1) {
      const minCount = Math.min(...validCounts);
      const maxCount = Math.max(...validCounts);
      const range = maxCount - minCount;

      if (minCount === 0 && maxCount === 0) {
        fluctuationMessage = `No fluctuation (0 departures)`;
      } else if (minCount === 0) {
        fluctuationMessage = `Fluctuated by ${range} departures (from 0)`;
      } else {
        const percentageFluctuation = (range / minCount) * 100;
        fluctuationMessage = `Fluctuated by ${range} departures (${percentageFluctuation.toFixed(0)}%) within the hour`;
      }
    } else if (validCounts.length === 1) {
      fluctuationMessage = `Only one data point (${validCounts[0]} departures)`;
    } else {
      fluctuationMessage = `No data points for fluctuation`;
    }
  } else {
    fluctuationMessage = `No data for fluctuation`;
  }

  const sortedGranularData = [...granularDataForHour].sort((a, b) => {
    const dateA = parseISO(a.timestamp).getTime();
    const dateB = parseISO(b.timestamp).getTime();
    return dateA - dateB;
  });

  const chartData = sortedGranularData.map(d => ({
    ...d,
    minute: getMinutes(parseISO(d.timestamp)),
  }));

  const allCountsInGraph = chartData.map(d => d.count).filter((c): c is number => c !== null);
  const minY = allCountsInGraph.length > 0 ? Math.min(...allCountsInGraph) : 0;
  const maxY = allCountsInGraph.length > 0 ? Math.max(...allCountsInGraph) : 5;
  const yAxisDomain = [minY > 0 ? minY - 1 : 0, maxY + 1];

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
        <h4 className="font-semibold mb-2 text-center">Departures for Hour {currentHour}:00 - {currentHour + 1}:00</h4>
        <div className="h-24 w-full mb-2">
          {isLoadingGranularData ? (
            <div className="flex items-center justify-center h-full">
              <Loader2 className="h-5 w-5 animate-spin mr-2" />
              Loading graph...
            </div>
          ) : chartData.length > 0 && chartData.some(d => d.count !== null) ? (
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData} margin={{ top: 5, right: 5, left: 5, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis
                  dataKey="minute"
                  type="category"
                  tickFormatter={(value) => `${value}m`}
                  axisLine={false}
                  tickLine={false}
                  fontSize={10}
                />
                <YAxis
                  tickFormatter={(value) => `${value}`}
                  axisLine={false}
                  tickLine={false}
                  fontSize={10}
                  domain={yAxisDomain}
                />
                <Tooltip
                  formatter={(value: number, _name: string, props: any) => {
                    const ts = props?.payload?.timestamp;
                    if (!ts || isNaN(parseISO(ts).getTime())) return [`${value} departures`, 'Unknown time'];
                    return [`${value} departures`, `Time ${format(parseISO(ts), 'HH:mm')}`];
                  }}
                  labelFormatter={(label) => `Minute ${label}`}
                />
                <Line
                  type="natural"
                  dataKey="count"
                  stroke="#FF8000"
                  strokeWidth={2}
                  dot={false}
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

export default DepartureDetailPopover;
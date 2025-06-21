import React from 'react';
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid } from 'recharts';
import { cn } from '@/lib/utils';

interface HourlySecurityData {
  hour: number;
  t1: number | null;
  t2: number | null;
}

interface HourlyDetailPopoverProps {
  children: React.ReactNode;
  hourlyData: HourlySecurityData[]; // All hourly data for the day
  currentHour: number; // The hour this popover is for
  terminalId: 1 | 2;
}

const HourlyDetailPopover: React.FC<HourlyDetailPopoverProps> = ({ children, hourlyData, currentHour, terminalId }) => {
  const dataKey = `t${terminalId}` as 't1' | 't2';

  // Prepare data for the 3-hour graph
  const graphData = [];
  for (let i = -2; i <= 0; i++) { // Current hour, previous hour, two hours ago
    const hourToFetch = currentHour + i;
    if (hourToFetch >= 0 && hourToFetch < 24) {
      const dataPoint = hourlyData.find(d => d.hour === hourToFetch);
      graphData.push({
        hour: hourToFetch,
        time: dataPoint ? dataPoint[dataKey] : null,
      });
    } else {
      graphData.push({ hour: hourToFetch, time: null }); // Placeholder for out-of-bounds hours
    }
  }
  // Filter out null hours if they are not relevant (e.g., hour -1, hour -2)
  const filteredGraphData = graphData.filter(d => d.hour >= 0 && d.hour < 24);

  // Calculate percentage changes
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

  // Determine Y-axis domain for the small graph
  const allTimesInGraph = filteredGraphData.map(d => d.time).filter((t): t is number => t !== null);
  const minY = allTimesInGraph.length > 0 ? Math.min(...allTimesInGraph) : 0;
  const maxY = allTimesInGraph.length > 0 ? Math.max(...allTimesInGraph) : 10; // Default max if no data
  const yAxisDomain = [minY > 0 ? minY - 5 : 0, maxY + 5]; // Add some padding

  return (
    <Popover>
      <PopoverTrigger asChild>{children}</PopoverTrigger>
      <PopoverContent className="w-64 p-3 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg shadow-lg text-sm">
        <h4 className="font-semibold mb-2 text-center">Hour {currentHour}:00 - {currentHour + 1}:00</h4>
        <div className="h-24 w-full mb-2">
          {filteredGraphData.length > 0 && filteredGraphData.some(d => d.time !== null) ? (
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={filteredGraphData} margin={{ top: 5, right: 5, left: 5, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis
                  dataKey="hour"
                  tickFormatter={(value) => `${value}h`}
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
                  formatter={(value: number, name: string, props: any) => [`${value}m`, `Hour ${props.payload.hour}`]}
                  labelFormatter={(label) => `Hour ${label}:00`}
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
            <p className="text-center text-muted-foreground text-xs mt-8">No data for graph.</p>
          )}
        </div>
        <div className="space-y-1 text-gray-700 dark:text-gray-300">
          {changeFromLastHour && <p>{changeFromLastHour}</p>}
          {changeToNextHour && <p>{changeToNextHour}</p>}
          {(changeFromLastHour === null && changeToNextHour === null) && (
            <p>No comparative data available.</p>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
};

export default HourlyDetailPopover;
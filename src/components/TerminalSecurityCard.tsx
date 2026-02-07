import React, { useEffect, useState, useCallback, useRef } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from "recharts";
import { apiClient } from "@/integrations/api/client";
import { Skeleton } from "@/components/ui/skeleton";
import { showError } from "@/utils/toast";
import { format, subDays, differenceInMinutes, getHours, startOfDay, parseISO, subHours, getMinutes } from "date-fns";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { RefreshCw, Loader2 } from "lucide-react";
import { getAutoPollEnabled, getAutoPollInterval } from '@/lib/cookies'; // Import cookie utilities
import ChatBubble from "./ChatBubble"; // Import the new ChatBubble component
import { useIsMobile } from "@/hooks/use-mobile"; // Import useIsMobile hook
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion"; // Import Accordion components
import HourlyDetailPopover from "./HourlyDetailPopover"; // Import the new HourlyDetailPopover
import DepartureDetailPopover from "./DepartureDetailPopover"; // Import the new DepartureDetailPopover

// Define interfaces for historical data structure received from Edge Function
interface HourlySecurityData {
  hour: number;
  t1: number | null;
  t2: number | null;
  timestamp: string | null; // Added timestamp
}

interface DailySecurityData {
  date: string; // yyyy-MM-dd
  hourlyData: HourlySecurityData[];
}

interface GranularSecurityData {
  timestamp: string;
  time: number | null;
}

interface GranularDepartureData {
  timestamp: string;
  count: number | null;
}

interface HourlyDepartureDisplayData {
  date: string; // e.g., "TODAY", "MON, JUL 1"
  hours: { value: number; colorClass: string }[]; // 24 entries for each hour
}

interface TerminalSecurityCardProps {
  terminalId: 1 | 2;
  globalMaxTime?: number | null; // New prop for consistent scaling
  isAutoRefreshing: boolean; // New prop to indicate if auto-refresh is active
  t1CurrentTime: number | null; // Current time for T1
  t2CurrentTime: number | null; // Current time for T2
}

const TerminalSecurityCard: React.FC<TerminalSecurityCardProps> = ({ terminalId, globalMaxTime, isAutoRefreshing, t1CurrentTime, t2CurrentTime }) => {
  const [currentTime, setCurrentTime] = useState<number | null>(null);
  const [lastUpdated, setLastUpdated] = useState<string | null>(null);
  const [historicalDailyAverages, setHistoricalDailyAverages] = useState<
    { date: string; t1Average: number | null }[]
  >([]);
  const [currentDayHourlyData, setCurrentDayHourlyData] = useState<HourlySecurityData[]>([]); // This will now hold the last 24 hours of *existing* data
  const [hourlyGranularSecurityData, setHourlyGranularSecurityData] = useState<Map<number, GranularSecurityData[]>>(new Map());
  const [departureData, setDepartureData] = useState<HourlyDepartureDisplayData[]>([]);
  const [hourlyGranularDepartureData, setHourlyGranularDepartureData] = useState<Map<string, Map<number, GranularDepartureData[]>>>(new Map()); // Map<DateString, Map<Hour, Data[]>>
  const [loading, setLoading] = useState(true);
  const [manualRefreshing, setManualRefreshing] = useState(false); // Renamed to avoid conflict
  const isMobile = useIsMobile(); // Use the hook to detect mobile

  const fetchDepartureData = useCallback(async () => {
    try {
      const threeDaysAgo = subDays(new Date(), 3).toISOString();
      const data = await apiClient.getDepartureData(terminalId.toString(), threeDaysAgo);
      const rawDepartureData = data as { departure_datetime: string; departure_count: number }[];
      console.log(`Raw departure data for T${terminalId} from Edge Function:`, rawDepartureData);

      const processedData: HourlyDepartureDisplayData[] = [];
      const today = new Date();
      const datesToProcess = [today, subDays(today, 1), subDays(today, 2)];
      const newHourlyGranularDepartureData = new Map<string, Map<number, GranularDepartureData[]>>();

      for (const [index, date] of datesToProcess.entries()) {
        const dayString = index === 0 ? "TODAY" : format(date, "EEE, MMM do").toUpperCase();
        const dateKeyForGranular = format(date, "yyyy-MM-dd"); // Use yyyy-MM-dd for granular fetching
        const hourlyCounts: number[] = Array(24).fill(0);
        const hourlyGranularMap = new Map<number, GranularDepartureData[]>();

        // Filter raw data for the current day and populate hourlyCounts
        rawDepartureData.forEach(item => {
          const itemDate = new Date(item.departure_datetime);
          if (format(itemDate, 'yyyy-MM-dd') === format(date, 'yyyy-MM-dd')) {
            const hour = getHours(itemDate);
            hourlyCounts[hour] = item.departure_count; // Assuming the raw data already has the latest count per hour
          }
        });

        // Fetch granular data for each hour of this day
        const fetchPromises = [];
        for (let hour = 0; hour < 24; hour++) {
          const targetTimestamp = `${dateKeyForGranular}T${String(hour).padStart(2, '0')}:00:00Z`;
          fetchPromises.push(
            apiClient.getHourlyIntervalDepartureData(terminalId.toString()).then((data) => {
              hourlyGranularMap.set(hour, data as GranularDepartureData[]);
            }).catch(err => {
              console.error(`Error fetching granular departure data for T${terminalId} hour ${hour} on ${dateKeyForGranular}:`, err);
              hourlyGranularMap.set(hour, []);
            })
          );
        }
        await Promise.all(fetchPromises);
        newHourlyGranularDepartureData.set(dayString, hourlyGranularMap); // Store by display date string

        const hoursWithColors = hourlyCounts.map(count => {
          let colorClass = "bg-gray-200"; // Default for no data or 0
          if (count === 0) colorClass = "bg-departure-green-dark";
          else if (count === 1) colorClass = "bg-departure-green-light";
          else if (count >= 2 && count <= 3) colorClass = "bg-departure-yellow";
          else if (count >= 4 && count <= 5) colorClass = "bg-departure-orange-yellow";
          else if (count >= 6 && count <= 10) colorClass = "bg-departure-orange";
          else if (count >= 11 && count <= 20) colorClass = "bg-departure-red-light";
          else if (count >= 21 && count <= 40) colorClass = "bg-departure-red";
          else if (count >= 41 && count <= 60) colorClass = "bg-departure-red-deep";
          else if (count > 60) colorClass = "bg-black"; // For counts > 60, just in case

          return { value: count, colorClass };
        });

        processedData.push({ date: dayString, hours: hoursWithColors });
      }

      setDepartureData(processedData);
      setHourlyGranularDepartureData(newHourlyGranularDepartureData);
    } catch (error) {
      console.error(`Error fetching departure data for Terminal ${terminalId}:`, error);
      setDepartureData([]);
      setHourlyGranularDepartureData(new Map());
    }
  }, [terminalId]);

  const fetchSecurityData = useCallback(async () => {
    setLoading(true);
    setManualRefreshing(true); // Set manual refreshing true for manual trigger
    try {
      const currentSecurityData = await apiClient.getCurrentSecurityData();
      setCurrentTime(currentSecurityData[`t${terminalId}`]);
      setLastUpdated(currentSecurityData.last_updated);

      const allHistoricalData = await apiClient.getSecurityData();
      console.log("Client: Processed historical data received from Edge Function:", allHistoricalData);
      
      // Calculate daily averages for the 7-day chart
      const dailyAverages = allHistoricalData.map(dayData => {
        const validTimes = dayData.hourlyData
          .map(h => h[`t${terminalId}`])
          .filter((t): t is number => t !== null);
        const t1Average = validTimes.length > 0
          ? Math.round(validTimes.reduce((sum, val) => sum + val, 0) / validTimes.length)
          : null;
        return { date: dayData.date, t1Average };
      });
      setHistoricalDailyAverages(dailyAverages);
      console.log("Client: Calculated daily averages for chart:", dailyAverages);

      // --- Logic for rolling last 24 hours of *existing* data points ---
      const allActualDataPoints: HourlySecurityData[] = [];
      allHistoricalData.forEach(dayData => {
        dayData.hourlyData.forEach(hourData => {
          // Only include data points that have a timestamp and a non-null time for the current terminal
          if (hourData.timestamp && hourData[`t${terminalId}`] !== null) {
            allActualDataPoints.push({
              hour: hourData.hour, // Keep hour for popover's granular data map key
              t1: hourData.t1,
              t2: hourData.t2,
              timestamp: hourData.timestamp, // This is the local time ISO string from Edge Function
            });
          }
        });
      });

      // Filter for data points within the last 24 hours from the current local time
      const nowLocal = new Date(); 
      const twentyFourHoursAgoLocal = subHours(nowLocal, 24);

      const relevant24HourData = allActualDataPoints.filter(item => {
        const itemTimestamp = parseISO(item.timestamp!); // Parse the local time ISO string
        return itemTimestamp.getTime() >= twentyFourHoursAgoLocal.getTime() && itemTimestamp.getTime() <= nowLocal.getTime();
      });

      // Sort by timestamp to ensure chronological order for display and popover calculations
      relevant24HourData.sort((a, b) => parseISO(a.timestamp!).getTime() - parseISO(b.timestamp!).getTime());

      setCurrentDayHourlyData(relevant24HourData); // This now holds all relevant data points, not just one per calendar hour.
      // --- End of logic for rolling 24 hours ---

      // Fetch granular (per-poll) data and group by calendar hour
      const granularSecurityDataMap = new Map<number, GranularSecurityData[]>();
      try {
        const rawGranularData = await apiClient.getHourlyIntervalSecurityData();
        // rawGranularData is an array of { timestamp, t1, t2 } (raw poll records)
        // Group by calendar hour and map to { timestamp, time } for the current terminal
        (rawGranularData as { timestamp: string; t1: number | null; t2: number | null }[]).forEach(record => {
          const recordDate = parseISO(record.timestamp);
          const hour = getHours(recordDate);
          const timeValue = record[`t${terminalId}` as 't1' | 't2'];
          if (!granularSecurityDataMap.has(hour)) {
            granularSecurityDataMap.set(hour, []);
          }
          granularSecurityDataMap.get(hour)!.push({
            timestamp: record.timestamp,
            time: timeValue,
          });
        });
      } catch (err) {
        console.error(`Error fetching granular security data for T${terminalId}:`, err);
      }
      setHourlyGranularSecurityData(granularSecurityDataMap);

    } catch (error) {
      console.error(`Error fetching data for Terminal ${terminalId}:`, error);
      showError(`Failed to load data for Terminal ${terminalId}. Please check console for details.`);
      setCurrentTime(null);
      setLastUpdated(null);
      setHistoricalDailyAverages([]);
      setCurrentDayHourlyData([]);
      setHourlyGranularSecurityData(new Map());
    } finally {
      setLoading(false);
      setManualRefreshing(false);
    }
  }, [terminalId]);

  useEffect(() => {
    refreshAllData(); // Initial fetch on mount
  }, [terminalId]); // Only re-run if terminalId changes

  const refreshAllData = useCallback(async () => {
    setLoading(true);
    setManualRefreshing(true);
    await Promise.all([
      fetchSecurityData(),
      fetchDepartureData(),
    ]);
    setLoading(false);
    setManualRefreshing(false);
  }, [fetchSecurityData, fetchDepartureData]);


  const handleRefresh = () => {
    refreshAllData();
  };

  const timeSinceLastUpdate = lastUpdated
    ? differenceInMinutes(new Date(), new Date(parseISO(lastUpdated)))
    : null;

  // Calculate max value for Y-axis domain, using globalMaxTime if provided
  const yAxisDomainMax = globalMaxTime !== null && globalMaxTime !== undefined
    ? Math.max(20, Math.ceil(globalMaxTime / 10) * 10) // Use global max, rounded up to nearest 10, min 20
    : Math.max(20, historicalDailyAverages.reduce((max, item) => { // Fallback to local max if global not provided
        return item.t1Average !== null && item.t1Average > max ? item.t1Average : max;
      }, 0) > 0 ? Math.ceil(historicalDailyAverages.reduce((max, item) => {
        return item.t1Average !== null && item.t1Average > max ? item.t1Average : max;
      }, 0) / 10) * 10 : 0);

  // Log the data right before rendering the chart
  console.log("Data for LineChart (historicalDailyAverages):", historicalDailyAverages);

  const hourLabels = ['12', '1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11'];

  // Helper function to format time (this one is for the popover's X-axis)
  const formatTime = (isoString: string) => {
    const date = parseISO(isoString);
    return getMinutes(date) === 0 ? format(date, 'h a') : format(date, 'h:mm a');
  };

  // Determine chat bubble message and styling based on current times
  let chatBubbleMessage: string | null = null;
  let chatBubbleEmoji: string | null = null;
  let chatBubbleClassName: string = "-top-12"; // Base class for positioning

  const areTimesValid = t1CurrentTime !== null && t2CurrentTime !== null;
  const areTimesEqual = areTimesValid && t1CurrentTime === t2CurrentTime;
  const isT1Quicker = areTimesValid && t1CurrentTime < t2CurrentTime;
  const isT2Quicker = areTimesValid && t2CurrentTime < t1CurrentTime;

  // Determine if this specific card should be styled green
  const shouldBeGreenStyled = areTimesEqual ||
                              (terminalId === 1 && isT1Quicker) ||
                              (terminalId === 2 && isT2Quicker);

  const cardBorderColorClass = shouldBeGreenStyled ? "border-custom-green" : "border-departure-orange";
  const cardHeaderBgClass = shouldBeGreenStyled ? "bg-custom-green" : "bg-departure-orange";
  const currentTimeColorClass = shouldBeGreenStyled ? "text-custom-green" : "text-departure-orange";

  if (areTimesEqual) {
    if (terminalId === 1) {
      chatBubbleMessage = "Pick me!";
      chatBubbleEmoji = "😝";
      chatBubbleClassName += " animate-bounce-twice";
    } else if (terminalId === 2) {
      chatBubbleMessage = "It doesn't even matter bro";
      chatBubbleEmoji = "🤷‍♂️";
      // No animation for T2 when times are equal
    }
  } else if (isT1Quicker && terminalId === 1) {
    chatBubbleMessage = "Pick me!";
    chatBubbleEmoji = "😝";
    chatBubbleClassName += " animate-bounce-twice";
  } else if (isT2Quicker && terminalId === 2) {
    chatBubbleMessage = "Pick me!";
    chatBubbleEmoji = "😝";
    chatBubbleClassName += " animate-bounce-twice";
  } else if (isT1Quicker && terminalId === 2) { // T2 is longest if T1 is quicker
    chatBubbleMessage = "Damn...";
    chatBubbleEmoji = "🥲";
    chatBubbleClassName += " bg-red-600 before:border-t-red-600";
  } else if (isT2Quicker && terminalId === 1) { // T1 is longest if T2 is quicker
    chatBubbleMessage = "Damn...";
    chatBubbleEmoji = "🥲";
    chatBubbleClassName += " bg-red-600 before:border-t-red-600";
  }

  return (
    <Card className={cn("w-full border-2 rounded-lg shadow-lg relative", cardBorderColorClass)}>
      {chatBubbleMessage && (
        <ChatBubble message={chatBubbleMessage} emoji={chatBubbleEmoji!} className={chatBubbleClassName} />
      )}
      <CardHeader className={cn("p-4 text-white text-center relative", cardHeaderBgClass)}>
        <CardTitle className="text-lg font-semibold mb-1">Security queue wait</CardTitle>
        <h2 className="text-3xl font-bold">Terminal {terminalId}</h2>
        <Button
          variant="ghost"
          size="icon"
          onClick={handleRefresh}
          disabled={manualRefreshing || isAutoRefreshing} // Disable if manual or auto refreshing
          className="absolute top-4 right-4 text-white hover:bg-white hover:text-custom-green"
        >
          {manualRefreshing || isAutoRefreshing ? ( // Show loader if manual or auto refreshing
            <Loader2 className="h-5 w-5 animate-spin" />
          ) : (
            <RefreshCw className="h-5 w-5" />
          )}
          <span className="sr-only">Refresh data</span>
        </Button>
      </CardHeader>
      <CardContent className="p-6 text-center">
        {loading ? (
          <div className="space-y-4">
            <Skeleton className="h-20 w-3/4 mx-auto" />
            <Skeleton className="h-6 w-1/2 mx-auto" />
            <Skeleton className="h-[150px] w-full" />
            <Skeleton className="h-[200px] w-full" />
          </div>
        ) : (
          <>
            <p className={cn("text-7xl font-extrabold mb-2", currentTimeColorClass)}>
              {currentTime !== null ? currentTime : "N/A"}
            </p>
            <p className={cn("text-2xl font-semibold mb-4", currentTimeColorClass)}>minutes</p>
            <p className="text-sm text-gray-500 mb-8">
              Last updated {timeSinceLastUpdate !== null ? `${timeSinceLastUpdate} minutes ago` : "N/A"}
            </p>

            <div className="mb-8 w-full">
              <h3 className="text-md font-semibold text-gray-700 mb-4">Last 24 Hours Security Times</h3>
              {currentDayHourlyData.length > 0 ? (
                <div className="grid grid-cols-6 sm:grid-cols-8 md:grid-cols-12 lg:grid-cols-auto gap-1 text-xs">
                  {currentDayHourlyData.map((dataPoint) => { // Renamed from hourData to dataPoint
                    let bgColorClass = "bg-gray-200";
                    if (dataPoint[`t${terminalId}`] !== null) {
                      const time = dataPoint[`t${terminalId}`]!;
                      if (time === 0) bgColorClass = "bg-departure-green-dark";
                      else if (time === 1) bgColorClass = "bg-departure-green-light";
                      else if (time >= 2 && time <= 3) bgColorClass = "bg-departure-yellow";
                      else if (time >= 4 && time <= 5) bgColorClass = "bg-departure-orange-yellow";
                      else if (time >= 6 && time <= 10) bgColorClass = "bg-departure-orange";
                      else if (time >= 11 && time <= 20) bgColorClass = "bg-departure-red-light";
                      else if (time >= 21 && time <= 40) bgColorClass = "bg-departure-red";
                      else if (time >= 41 && time <= 60) bgColorClass = "bg-departure-red-deep";
                      else if (time > 60) bgColorClass = "bg-black";
                    }

                    return (
                      <HourlyDetailPopover
                        key={dataPoint.timestamp!} // Use the unique timestamp as key
                        all24HourData={currentDayHourlyData} // Pass the full array
                        currentDataPoint={dataPoint} // Pass the specific data point
                        terminalId={terminalId}
                        granularDataForHour={hourlyGranularSecurityData.get(getHours(parseISO(dataPoint.timestamp!))) || []}
                        isLoadingGranularData={loading}
                      >
                        <div
                          className={cn(
                            "flex flex-col items-center justify-center p-1 rounded-sm text-white font-bold cursor-pointer",
                            "hover:scale-105 hover:shadow-lg transition-all duration-200",
                            bgColorClass
                          )}
                        >
                          <span>{format(parseISO(dataPoint.timestamp!), 'h a')}</span> {/* Display formatted hour (e.g., "2 AM") */}
                          <span>{dataPoint[`t${terminalId}`] !== null ? `${dataPoint[`t${terminalId}`]}m` : "N/A"}</span>
                        </div>
                      </HourlyDetailPopover>
                    );
                  })}
                </div>
              ) : (
                <p className="text-center text-muted-foreground text-sm">No hourly data for the last 24 hours.</p>
              )}
            </div>

            {isMobile ? (
              <Accordion type="single" collapsible className="w-full">
                <AccordionItem value="departures">
                  <AccordionTrigger className="text-md font-semibold text-gray-700">Number of Departures</AccordionTrigger>
                  <AccordionContent>
                    {departureData.length > 0 ? (
                      departureData.map((day, dayIndex) => (
                        <div key={dayIndex} className="mb-4 last:mb-0">
                          {/* Hourly Labels */}
                          <div className="grid grid-cols-[auto_repeat(12,minmax(0,1fr))] gap-1 mb-1">
                            <div className="col-span-1"></div> {/* Empty space for AM/PM label */}
                            {hourLabels.map((label, i) => (
                              <div key={`hour-label-${i}`} className="text-center text-xs font-semibold text-gray-700">
                                {label}
                              </div>
                            ))}
                          </div>

                          {/* AM Row */}
                          <div className="grid grid-cols-[auto_repeat(12,minmax(0,1fr))] gap-1 items-center">
                            <div className="col-span-1 text-xs font-semibold text-gray-700 text-right pr-1">AM</div>
                            {day.hours.slice(0, 12).map((hour, hourIndex) => (
                              <DepartureDetailPopover
                                key={`${day.date}-am-${hourIndex}`}
                                dailyDepartureData={departureData}
                                currentDateString={day.date}
                                currentHour={hourIndex}
                                terminalId={terminalId}
                                granularDataForHour={hourlyGranularDepartureData.get(day.date)?.get(hourIndex) || []}
                                isLoadingGranularData={loading}
                              >
                                <div
                                  className={cn(
                                    "w-6 h-6 flex items-center justify-center text-white text-xs font-bold rounded-sm cursor-pointer",
                                    "hover:scale-105 hover:shadow-lg transition-all duration-200",
                                    hour.colorClass
                                  )}
                                >
                                  {hour.value}
                                </div>
                              </DepartureDetailPopover>
                            ))}
                          </div>

                          {/* PM Row */}
                          <div className="grid grid-cols-[auto_repeat(12,minmax(0,1fr))] gap-1 items-center mt-1">
                            <div className="col-span-1 text-xs font-semibold text-gray-700 text-right pr-1">PM</div>
                            {day.hours.slice(12, 24).map((hour, hourIndex) => (
                              <DepartureDetailPopover
                                key={`${day.date}-pm-${hourIndex + 12}`}
                                dailyDepartureData={departureData}
                                currentDateString={day.date}
                                currentHour={hourIndex + 12}
                                terminalId={terminalId}
                                granularDataForHour={hourlyGranularDepartureData.get(day.date)?.get(hourIndex + 12) || []}
                                isLoadingGranularData={loading}
                              >
                                <div
                                  className={cn(
                                    "w-6 h-6 flex items-center justify-center text-white text-xs font-bold rounded-sm cursor-pointer",
                                    "hover:scale-105 hover:shadow-lg transition-all duration-200",
                                    hour.colorClass
                                  )}
                                >
                                  {hour.value}
                                </div>
                              </DepartureDetailPopover>
                            ))}
                          </div>

                          <p className="text-sm font-medium text-gray-500 mt-2 text-center">{day.date}</p>
                        </div>
                      ))
                    ) : (
                      <p className="text-center text-muted-foreground text-sm">No departure data available.</p>
                    )}
                  </AccordionContent>
                </AccordionItem>
              </Accordion>
            ) : (
              <div>
                <h3 className="text-md font-semibold text-gray-700 mb-4">Number of Departures</h3>
                {departureData.length > 0 ? (
                  departureData.map((day, dayIndex) => (
                    <div key={dayIndex} className="mb-4 last:mb-0">
                      {/* Hourly Labels */}
                      <div className="grid grid-cols-[auto_repeat(12,minmax(0,1fr))] gap-1 mb-1">
                        <div className="col-span-1"></div> {/* Empty space for AM/PM label */}
                        {hourLabels.map((label, i) => (
                          <div key={`hour-label-${i}`} className="text-center text-xs font-semibold text-gray-700">
                            {label}
                          </div>
                        ))}
                      </div>

                      {/* AM Row */}
                      <div className="grid grid-cols-[auto_repeat(12,minmax(0,1fr))] gap-1 items-center">
                        <div className="col-span-1 text-xs font-semibold text-gray-700 text-right pr-1">AM</div>
                        {day.hours.slice(0, 12).map((hour, hourIndex) => (
                          <DepartureDetailPopover
                            key={`${day.date}-am-${hourIndex}`}
                            dailyDepartureData={departureData}
                            currentDateString={day.date}
                            currentHour={hourIndex}
                            terminalId={terminalId}
                            granularDataForHour={hourlyGranularDepartureData.get(day.date)?.get(hourIndex) || []}
                            isLoadingGranularData={loading}
                          >
                            <div
                              className={cn(
                                "w-6 h-6 flex items-center justify-center text-white text-xs font-bold rounded-sm cursor-pointer",
                                "hover:scale-105 hover:shadow-lg transition-all duration-200",
                                hour.colorClass
                              )}
                            >
                              {hour.value}
                            </div>
                          </DepartureDetailPopover>
                        ))}
                      </div>

                      {/* PM Row */}
                      <div className="grid grid-cols-[auto_repeat(12,minmax(0,1fr))] gap-1 items-center mt-1">
                        <div className="col-span-1 text-xs font-semibold text-gray-700 text-right pr-1">PM</div>
                        {day.hours.slice(12, 24).map((hour, hourIndex) => (
                          <DepartureDetailPopover
                            key={`${day.date}-pm-${hourIndex + 12}`}
                            dailyDepartureData={departureData}
                            currentDateString={day.date}
                            currentHour={hourIndex + 12}
                            terminalId={terminalId}
                            granularDataForHour={hourlyGranularDepartureData.get(day.date)?.get(hourIndex + 12) || []}
                            isLoadingGranularData={loading}
                          >
                            <div
                              className={cn(
                                "w-6 h-6 flex items-center justify-center text-white text-xs font-bold rounded-sm cursor-pointer",
                                "hover:scale-105 hover:shadow-lg transition-all duration-200",
                                hour.colorClass
                              )}
                            >
                              {hour.value}
                            </div>
                          </DepartureDetailPopover>
                        ))}
                      </div>

                      <p className="text-sm font-medium text-gray-500 mt-2 text-center">{day.date}</p>
                    </div>
                  ))
                ) : (
                  <p className="text-center text-muted-foreground text-sm">No departure data available.</p>
                )}
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
};

export default TerminalSecurityCard;
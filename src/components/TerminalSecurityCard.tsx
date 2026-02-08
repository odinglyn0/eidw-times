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
import { getAutoPollEnabled, getAutoPollInterval } from '@/lib/cookies';
import ChatBubble from "./ChatBubble";
import { useIsMobile } from "@/hooks/use-mobile";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import HourlyDetailPopover from "./HourlyDetailPopover";
import DepartureDetailPopover from "./DepartureDetailPopover";
import ProjectedHourlyPopover from "./ProjectedHourlyPopover";
import HourGraphDialog from "./HourGraphDialog";
import LaserPulseBorder from "./LaserPulseBorder";

interface HourlySecurityData {
  hour: number;
  t1: number | null;
  t2: number | null;
  timestamp: string | null;
}

interface DailySecurityData {
  date: string;
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
  date: string;
  hours: { value: number; colorClass: string }[];
}

interface TerminalSecurityCardProps {
  terminalId: 1 | 2;
  globalMaxTime?: number | null;
  isAutoRefreshing: boolean;
  t1CurrentTime: number | null;
  t2CurrentTime: number | null;
}

const TerminalSecurityCard: React.FC<TerminalSecurityCardProps> = ({ terminalId, globalMaxTime, isAutoRefreshing, t1CurrentTime, t2CurrentTime }) => {
  const [currentTime, setCurrentTime] = useState<number | null>(null);
  const [lastUpdated, setLastUpdated] = useState<string | null>(null);
  const [historicalDailyAverages, setHistoricalDailyAverages] = useState<
    { date: string; t1Average: number | null }[]
  >([]);
  const [currentDayHourlyData, setCurrentDayHourlyData] = useState<HourlySecurityData[]>([]);
  const [hourlyGranularSecurityData, setHourlyGranularSecurityData] = useState<Map<number, GranularSecurityData[]>>(new Map());
  const [departureData, setDepartureData] = useState<HourlyDepartureDisplayData[]>([]);
  const [hourlyGranularDepartureData, setHourlyGranularDepartureData] = useState<Map<string, Map<number, GranularDepartureData[]>>>(new Map());
  const [loading, setLoading] = useState(true);
  const [manualRefreshing, setManualRefreshing] = useState(false);
  const [hourGraphOpen, setHourGraphOpen] = useState(false);
  const isMobile = useIsMobile();

  const fetchDepartureData = useCallback(async () => {
    try {
      const threeDaysAgo = subDays(new Date(), 3).toISOString();
      const data = await apiClient.getDepartureData(terminalId.toString(), threeDaysAgo);
      const rawDepartureData = data as { departure_datetime: string; departure_count: number }[];

      const processedData: HourlyDepartureDisplayData[] = [];
      const today = new Date();
      const datesToProcess = [today, subDays(today, 1), subDays(today, 2)];
      const newHourlyGranularDepartureData = new Map<string, Map<number, GranularDepartureData[]>>();

      let allGranularDepartureData: GranularDepartureData[] = [];
      try {
        allGranularDepartureData = await apiClient.getHourlyIntervalDepartureData(terminalId.toString()) as GranularDepartureData[];
      } catch (err) {
        console.error(`Error fetching granular departure data for T${terminalId}:`, err);
      }

      for (const [index, date] of datesToProcess.entries()) {
        const dayString = index === 0 ? "TODAY" : format(date, "EEE, MMM do").toUpperCase();
        const dateKeyForGranular = format(date, "yyyy-MM-dd");
        const hourlyCounts: number[] = Array(24).fill(0);
        const hourlyGranularMap = new Map<number, GranularDepartureData[]>();

        rawDepartureData.forEach(item => {
          const itemDate = new Date(item.departure_datetime);
          if (format(itemDate, 'yyyy-MM-dd') === format(date, 'yyyy-MM-dd')) {
            const hour = getHours(itemDate);
            hourlyCounts[hour] = item.departure_count;
          }
        });

        allGranularDepartureData.forEach(record => {
          if (!record.timestamp) return;
          const recordDate = parseISO(record.timestamp);
          if (isNaN(recordDate.getTime())) return;
          if (format(recordDate, 'yyyy-MM-dd') === dateKeyForGranular) {
            const hour = getHours(recordDate);
            if (!hourlyGranularMap.has(hour)) {
              hourlyGranularMap.set(hour, []);
            }
            hourlyGranularMap.get(hour)!.push(record);
          }
        });

        newHourlyGranularDepartureData.set(dayString, hourlyGranularMap);

        const hoursWithColors = hourlyCounts.map(count => {
          let colorClass = "bg-gray-200";
          if (count === 0) colorClass = "bg-departure-green-dark";
          else if (count === 1) colorClass = "bg-departure-green-light";
          else if (count >= 2 && count <= 3) colorClass = "bg-departure-yellow";
          else if (count >= 4 && count <= 5) colorClass = "bg-departure-orange-yellow";
          else if (count >= 6 && count <= 10) colorClass = "bg-departure-orange";
          else if (count >= 11 && count <= 20) colorClass = "bg-departure-red-light";
          else if (count >= 21 && count <= 40) colorClass = "bg-departure-red";
          else if (count >= 41 && count <= 60) colorClass = "bg-departure-red-deep";
          else if (count > 60) colorClass = "bg-black";

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
    setManualRefreshing(true);
    try {
      const currentSecurityData = await apiClient.getCurrentSecurityData();
      setCurrentTime(currentSecurityData[`t${terminalId}`]);
      setLastUpdated(currentSecurityData.last_updated);

      const allHistoricalData = await apiClient.getSecurityData();
      
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

      const allActualDataPoints: HourlySecurityData[] = [];
      const granularSecurityDataMap = new Map<number, GranularSecurityData[]>();

      allHistoricalData.forEach(dayData => {
        dayData.hourlyData.forEach(hourData => {
          if (hourData.timestamp && hourData[`t${terminalId}`] !== null) {
            allActualDataPoints.push({
              hour: hourData.hour,
              t1: hourData.t1,
              t2: hourData.t2,
              timestamp: hourData.timestamp,
            });
          }

          const records = (hourData as any).records as { timestamp: string; t1: number | null; t2: number | null }[] | undefined;
          if (records && records.length > 0) {
            records.forEach(record => {
              if (!record.timestamp) return;
              const recordDate = parseISO(record.timestamp);
              if (isNaN(recordDate.getTime())) return;
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
          }
        });
      });

      const nowLocal = new Date(); 
      const twentyFourHoursAgoLocal = subHours(nowLocal, 24);

      const relevant24HourData = allActualDataPoints.filter(item => {
        const itemTimestamp = parseISO(item.timestamp!);
        return itemTimestamp.getTime() >= twentyFourHoursAgoLocal.getTime() && itemTimestamp.getTime() <= nowLocal.getTime();
      });

      relevant24HourData.sort((a, b) => parseISO(a.timestamp!).getTime() - parseISO(b.timestamp!).getTime());

      setCurrentDayHourlyData(relevant24HourData);
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
    refreshAllData();
  }, [terminalId]);

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

  const yAxisDomainMax = globalMaxTime !== null && globalMaxTime !== undefined
    ? Math.max(20, Math.ceil(globalMaxTime / 10) * 10)
    : Math.max(20, historicalDailyAverages.reduce((max, item) => {
        return item.t1Average !== null && item.t1Average > max ? item.t1Average : max;
      }, 0) > 0 ? Math.ceil(historicalDailyAverages.reduce((max, item) => {
        return item.t1Average !== null && item.t1Average > max ? item.t1Average : max;
      }, 0) / 10) * 10 : 0);

  const hourLabels = ['12', '1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11'];

  const formatTime = (isoString: string) => {
    const date = parseISO(isoString);
    return getMinutes(date) === 0 ? format(date, 'h a') : format(date, 'h:mm a');
  };

  let chatBubbleMessage: string | null = null;
  let chatBubbleEmoji: string | null = null;
  let chatBubbleClassName: string = "-top-12";

  const areTimesValid = t1CurrentTime !== null && t2CurrentTime !== null;
  const areTimesEqual = areTimesValid && t1CurrentTime === t2CurrentTime;
  const isT1Quicker = areTimesValid && t1CurrentTime < t2CurrentTime;
  const isT2Quicker = areTimesValid && t2CurrentTime < t1CurrentTime;

  const shouldBeGreenStyled = areTimesEqual ||
                              (terminalId === 1 && isT1Quicker) ||
                              (terminalId === 2 && isT2Quicker);

  const cardBorderColorClass = shouldBeGreenStyled ? "border-custom-green" : "border-departure-orange";
  const cardHeaderBgClass = shouldBeGreenStyled ? "bg-custom-green" : "bg-departure-orange";
  const currentTimeColorClass = shouldBeGreenStyled ? "text-custom-green" : "text-departure-orange";

  if (areTimesEqual) {
    if (terminalId === 1) {
      chatBubbleMessage = "Pick me!";
      chatBubbleEmoji = "😃";
      chatBubbleClassName += " animate-bounce-twice";
    } else if (terminalId === 2) {
      chatBubbleMessage = "It doesn't even matter";
      chatBubbleEmoji = "🤷‍♂️";
    }
  } else if (isT1Quicker && terminalId === 1) {
    chatBubbleMessage = "Pick me!";
    chatBubbleEmoji = "😃";
    chatBubbleClassName += " animate-bounce-twice";
  } else if (isT2Quicker && terminalId === 2) {
    chatBubbleMessage = "Pick me!";
    chatBubbleEmoji = "😃";
    chatBubbleClassName += " animate-bounce-twice";
  } else if (isT1Quicker && terminalId === 2) {
    chatBubbleMessage = "Ah sure, I'm usually the fast one";
    chatBubbleEmoji = "🥲";
    chatBubbleClassName += " bg-red-600 before:border-t-red-600";
  } else if (isT2Quicker && terminalId === 1) {
    chatBubbleMessage = "Feck sake...";
    chatBubbleEmoji = "🥲";
    chatBubbleClassName += " bg-red-600 before:border-t-red-600";
  }

  return (
    <LaserPulseBorder
      active={manualRefreshing || isAutoRefreshing}
      config={{
        color: shouldBeGreenStyled ? "#4CAF50" : "#FF8000",
        duration: 600,
        pulseWidth: 50,
        bulgeAmount: 4,
        bulgeSpread: 36,
        borderRadius: 8,
      }}
      className="w-full"
    >
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
          disabled={manualRefreshing || isAutoRefreshing}
          className="absolute top-4 right-4 text-white hover:bg-white hover:text-custom-green"
        >
          {manualRefreshing || isAutoRefreshing ? (
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
            <div
              className="cursor-pointer hover:opacity-80 transition-opacity"
              onClick={() => setHourGraphOpen(true)}
              title="Click for detailed hour graph"
            >
              <p className={cn("text-7xl font-extrabold mb-2", currentTimeColorClass)}>
                {currentTime !== null ? currentTime : "N/A"}
              </p>
              <p className={cn("text-2xl font-semibold mb-4", currentTimeColorClass)}>minutes</p>
            </div>
            <p className="text-sm text-gray-500 dark:text-gray-400 mb-8">
              Last updated {timeSinceLastUpdate !== null ? `${timeSinceLastUpdate} minutes ago` : "N/A"}
            </p>
            <div className="mb-4">
              <ProjectedHourlyPopover
                terminalId={terminalId}
                currentTime={currentTime}
              />
            </div>

            <HourGraphDialog
              open={hourGraphOpen}
              onOpenChange={setHourGraphOpen}
              terminalId={terminalId}
              securityData={hourlyGranularSecurityData.get(new Date().getHours()) || []}
              departureData={hourlyGranularDepartureData.get("TODAY")?.get(new Date().getHours()) || []}
              currentTime={currentTime}
            />

            <div className="mb-8 w-full">
              <h3 className="text-md font-semibold text-gray-700 dark:text-gray-200 mb-4">Last 24 Hours Security Times</h3>
              {currentDayHourlyData.length > 0 ? (
                <div className="grid grid-cols-6 sm:grid-cols-8 md:grid-cols-12 lg:grid-cols-auto gap-1 text-xs">
                  {currentDayHourlyData.map((dataPoint) => {
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
                        key={dataPoint.timestamp!}
                        all24HourData={currentDayHourlyData}
                        currentDataPoint={dataPoint}
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
                          <span>{format(parseISO(dataPoint.timestamp!), 'h a')}</span>
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
                  <AccordionTrigger className="text-md font-semibold text-gray-700 dark:text-gray-200">Number of Departures</AccordionTrigger>
                  <AccordionContent>
                    {departureData.length > 0 ? (
                      departureData.map((day, dayIndex) => (
                        <div key={dayIndex} className="mb-4 last:mb-0">
                          <div className="grid grid-cols-[auto_repeat(12,minmax(0,1fr))] gap-1 mb-1">
                            <div className="col-span-1"></div>
                            {hourLabels.map((label, i) => (
                              <div key={`hour-label-${i}`} className="text-center text-xs font-semibold text-gray-700 dark:text-gray-200">
                                {label}
                              </div>
                            ))}
                          </div>

                          <div className="grid grid-cols-[auto_repeat(12,minmax(0,1fr))] gap-1 items-center">
                            <div className="col-span-1 text-xs font-semibold text-gray-700 dark:text-gray-200 text-right pr-1">AM</div>
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

                          <div className="grid grid-cols-[auto_repeat(12,minmax(0,1fr))] gap-1 items-center mt-1">
                            <div className="col-span-1 text-xs font-semibold text-gray-700 dark:text-gray-200 text-right pr-1">PM</div>
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

                          <p className="text-sm font-medium text-gray-500 dark:text-gray-400 mt-2 text-center">{day.date}</p>
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
                <h3 className="text-md font-semibold text-gray-700 dark:text-gray-200 mb-4">Number of Departures</h3>
                {departureData.length > 0 ? (
                  departureData.map((day, dayIndex) => (
                    <div key={dayIndex} className="mb-4 last:mb-0">
                      <div className="grid grid-cols-[auto_repeat(12,minmax(0,1fr))] gap-1 mb-1">
                        <div className="col-span-1"></div>
                        {hourLabels.map((label, i) => (
                          <div key={`hour-label-${i}`} className="text-center text-xs font-semibold text-gray-700 dark:text-gray-200">
                            {label}
                          </div>
                        ))}
                      </div>

                      <div className="grid grid-cols-[auto_repeat(12,minmax(0,1fr))] gap-1 items-center">
                        <div className="col-span-1 text-xs font-semibold text-gray-700 dark:text-gray-200 text-right pr-1">AM</div>
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

                      <div className="grid grid-cols-[auto_repeat(12,minmax(0,1fr))] gap-1 items-center mt-1">
                        <div className="col-span-1 text-xs font-semibold text-gray-700 dark:text-gray-200 text-right pr-1">PM</div>
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

                      <p className="text-sm font-medium text-gray-500 dark:text-gray-400 mt-2 text-center">{day.date}</p>
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
    </LaserPulseBorder>
  );
};

export default TerminalSecurityCard;

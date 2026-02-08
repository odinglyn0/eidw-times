import React, { useEffect, useState, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Crd";
import { apiClient } from "@/integrations/api/client";
import { Skeleton } from "@/components/ui/Skel";
import { showError } from "@/utils/toast";
import { format, differenceInMinutes, parseISO, getHours } from "date-fns";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/Btt";
import { RefreshCw, Loader2 } from "lucide-react";
import ChatBubble from "./Bubbles";
import { useIsMobile } from "@/hooks/use-mobile";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/ACC";
import HourlyDetailPopover from "./HDPopO";
import DepartureDetailPopover from "./DDPopO";
import ProjectedHourlyPopover from "./PHPopO";
import HourGraphDialog from "./HgDi";
import LaserPulseBorder from "./LPB";

interface HourlySecurityData {
  hour: number;
  t1: number | null;
  t2: number | null;
  timestamp: string | null;
  colorClass?: string;
  displayValue?: number | null;
}

interface HourlyDepartureDisplayData {
  date: string;
  hours: { value: number; colorClass: string }[];
}

interface GranularSecurityData {
  timestamp: string;
  time: number | null;
}

interface GranularDepartureData {
  timestamp: string;
  count: number | null;
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
  const [granularByHour, setGranularByHour] = useState<Record<number, GranularSecurityData[]>>({});
  const [departureData, setDepartureData] = useState<HourlyDepartureDisplayData[]>([]);
  const [hourlyGranularDepartureData, setHourlyGranularDepartureData] = useState<Map<string, Map<number, GranularDepartureData[]>>>(new Map());
  const [loading, setLoading] = useState(true);
  const [manualRefreshing, setManualRefreshing] = useState(false);
  const [hourGraphOpen, setHourGraphOpen] = useState(false);
  const isMobile = useIsMobile();

  const fetchDepartureData = useCallback(async () => {
    try {
      const data = await apiClient.getProcessedDepartureData(terminalId);
      setDepartureData(data.days || []);
      let allGranularDepartureData: GranularDepartureData[] = [];
      try {
        allGranularDepartureData = await apiClient.getHourlyIntervalDepartureData(terminalId.toString()) as GranularDepartureData[];
      } catch (err) {
        console.error(`Error fetching granular departure data for T${terminalId}:`, err);
      }

      const newMap = new Map<string, Map<number, GranularDepartureData[]>>();
      const days = data.days || [];
      for (const day of days) {
        const hourlyGranularMap = new Map<number, GranularDepartureData[]>();
        allGranularDepartureData.forEach(record => {
          if (!record.timestamp) return;
          const recordDate = parseISO(record.timestamp);
          if (isNaN(recordDate.getTime())) return;
          const hour = getHours(recordDate);
          if (!hourlyGranularMap.has(hour)) hourlyGranularMap.set(hour, []);
          hourlyGranularMap.get(hour)!.push(record);
        });
        newMap.set(day.date, hourlyGranularMap);
      }
      setHourlyGranularDepartureData(newMap);
    } catch (error) {
      console.error(`Error fetching departure data for Terminal ${terminalId}:`, error);
      setDepartureData([]);
      setHourlyGranularDepartureData(new Map());
    }
  }, [terminalId]);

  const fetchSecurityData = useCallback(async () => {
    try {
      const currentSecurityData = await apiClient.getCurrentSecurityData();
      setCurrentTime(currentSecurityData[`t${terminalId}`]);
      setLastUpdated(currentSecurityData.last_updated);

      const processed = await apiClient.getProcessedSecurityData(terminalId);
      setHistoricalDailyAverages(processed.dailyAverages || []);
      setCurrentDayHourlyData(processed.last24HourData || []);
      setGranularByHour(processed.granularByHour || {});
    } catch (error) {
      console.error(`Error fetching data for Terminal ${terminalId}:`, error);
      showError(`Failed to load data for Terminal ${terminalId}.`);
      setCurrentTime(null);
      setLastUpdated(null);
      setHistoricalDailyAverages([]);
      setCurrentDayHourlyData([]);
      setGranularByHour({});
    }
  }, [terminalId]);

  const refreshAllData = useCallback(async () => {
    setLoading(true);
    setManualRefreshing(true);
    await Promise.all([fetchSecurityData(), fetchDepartureData()]);
    setLoading(false);
    setManualRefreshing(false);
  }, [fetchSecurityData, fetchDepartureData]);

  useEffect(() => { refreshAllData(); }, [terminalId]);

  const handleRefresh = () => { refreshAllData(); };

  const timeSinceLastUpdate = lastUpdated
    ? differenceInMinutes(new Date(), new Date(parseISO(lastUpdated)))
    : null;

  const hourLabels = ['12', '1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11'];

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
    if (terminalId === 1) { chatBubbleMessage = "Pick me!"; chatBubbleEmoji = "😃"; chatBubbleClassName += " animate-bounce-twice"; }
    else { chatBubbleMessage = "It doesn't even matter"; chatBubbleEmoji = "🤷‍♂️"; }
  } else if (isT1Quicker && terminalId === 1) { chatBubbleMessage = "Pick me!"; chatBubbleEmoji = "😃"; chatBubbleClassName += " animate-bounce-twice"; }
  else if (isT2Quicker && terminalId === 2) { chatBubbleMessage = "Pick me!"; chatBubbleEmoji = "😃"; chatBubbleClassName += " animate-bounce-twice"; }
  else if (isT1Quicker && terminalId === 2) { chatBubbleMessage = "Ah sure, I'm usually the fast one"; chatBubbleEmoji = "🥲"; chatBubbleClassName += " bg-red-600 before:border-t-red-600"; }
  else if (isT2Quicker && terminalId === 1) { chatBubbleMessage = "Feck sake..."; chatBubbleEmoji = "🥲"; chatBubbleClassName += " bg-red-600 before:border-t-red-600"; }

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
              <ProjectedHourlyPopover terminalId={terminalId} currentTime={currentTime} />
            </div>

            <HourGraphDialog
              open={hourGraphOpen}
              onOpenChange={setHourGraphOpen}
              terminalId={terminalId}
              currentTime={currentTime}
            />

            <div className="mb-8 w-full">
              <h3 className="text-md font-semibold text-gray-700 dark:text-gray-200 mb-4">Last 24 Hours Security Times</h3>
              {currentDayHourlyData.length > 0 ? (
                <div className="grid grid-cols-6 sm:grid-cols-8 md:grid-cols-12 lg:grid-cols-auto gap-1 text-xs">
                  {currentDayHourlyData.map((dataPoint) => (
                    <HourlyDetailPopover
                      key={dataPoint.timestamp!}
                      all24HourData={currentDayHourlyData}
                      currentDataPoint={dataPoint}
                      terminalId={terminalId}
                      granularDataForHour={(granularByHour[getHours(parseISO(dataPoint.timestamp!))] || []) as GranularSecurityData[]}
                      isLoadingGranularData={loading}
                    >
                      <div
                        className={cn(
                          "flex flex-col items-center justify-center p-1 rounded-sm text-white font-bold cursor-pointer",
                          "hover:scale-105 hover:shadow-lg transition-all duration-200",
                          dataPoint.colorClass || "bg-gray-200"
                        )}
                      >
                        <span>{format(parseISO(dataPoint.timestamp!), 'h a')}</span>
                        <span>{dataPoint.displayValue !== null && dataPoint.displayValue !== undefined ? `${dataPoint.displayValue}m` : "N/A"}</span>
                      </div>
                    </HourlyDetailPopover>
                  ))}
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
                              <div key={`hour-label-${i}`} className="text-center text-xs font-semibold text-gray-700 dark:text-gray-200">{label}</div>
                            ))}
                          </div>
                          <div className="grid grid-cols-[auto_repeat(12,minmax(0,1fr))] gap-1 items-center">
                            <div className="col-span-1 text-xs font-semibold text-gray-700 dark:text-gray-200 text-right pr-1">AM</div>
                            {day.hours.slice(0, 12).map((hour, hourIndex) => (
                              <DepartureDetailPopover key={`${day.date}-am-${hourIndex}`} dailyDepartureData={departureData} currentDateString={day.date} currentHour={hourIndex} terminalId={terminalId} granularDataForHour={hourlyGranularDepartureData.get(day.date)?.get(hourIndex) || []} isLoadingGranularData={loading}>
                                <div className={cn("w-6 h-6 flex items-center justify-center text-white text-xs font-bold rounded-sm cursor-pointer hover:scale-105 hover:shadow-lg transition-all duration-200", hour.colorClass)}>{hour.value}</div>
                              </DepartureDetailPopover>
                            ))}
                          </div>
                          <div className="grid grid-cols-[auto_repeat(12,minmax(0,1fr))] gap-1 items-center mt-1">
                            <div className="col-span-1 text-xs font-semibold text-gray-700 dark:text-gray-200 text-right pr-1">PM</div>
                            {day.hours.slice(12, 24).map((hour, hourIndex) => (
                              <DepartureDetailPopover key={`${day.date}-pm-${hourIndex + 12}`} dailyDepartureData={departureData} currentDateString={day.date} currentHour={hourIndex + 12} terminalId={terminalId} granularDataForHour={hourlyGranularDepartureData.get(day.date)?.get(hourIndex + 12) || []} isLoadingGranularData={loading}>
                                <div className={cn("w-6 h-6 flex items-center justify-center text-white text-xs font-bold rounded-sm cursor-pointer hover:scale-105 hover:shadow-lg transition-all duration-200", hour.colorClass)}>{hour.value}</div>
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
                          <div key={`hour-label-${i}`} className="text-center text-xs font-semibold text-gray-700 dark:text-gray-200">{label}</div>
                        ))}
                      </div>
                      <div className="grid grid-cols-[auto_repeat(12,minmax(0,1fr))] gap-1 items-center">
                        <div className="col-span-1 text-xs font-semibold text-gray-700 dark:text-gray-200 text-right pr-1">AM</div>
                        {day.hours.slice(0, 12).map((hour, hourIndex) => (
                          <DepartureDetailPopover key={`${day.date}-am-${hourIndex}`} dailyDepartureData={departureData} currentDateString={day.date} currentHour={hourIndex} terminalId={terminalId} granularDataForHour={hourlyGranularDepartureData.get(day.date)?.get(hourIndex) || []} isLoadingGranularData={loading}>
                            <div className={cn("w-6 h-6 flex items-center justify-center text-white text-xs font-bold rounded-sm cursor-pointer hover:scale-105 hover:shadow-lg transition-all duration-200", hour.colorClass)}>{hour.value}</div>
                          </DepartureDetailPopover>
                        ))}
                      </div>
                      <div className="grid grid-cols-[auto_repeat(12,minmax(0,1fr))] gap-1 items-center mt-1">
                        <div className="col-span-1 text-xs font-semibold text-gray-700 dark:text-gray-200 text-right pr-1">PM</div>
                        {day.hours.slice(12, 24).map((hour, hourIndex) => (
                          <DepartureDetailPopover key={`${day.date}-pm-${hourIndex + 12}`} dailyDepartureData={departureData} currentDateString={day.date} currentHour={hourIndex + 12} terminalId={terminalId} granularDataForHour={hourlyGranularDepartureData.get(day.date)?.get(hourIndex + 12) || []} isLoadingGranularData={loading}>
                            <div className={cn("w-6 h-6 flex items-center justify-center text-white text-xs font-bold rounded-sm cursor-pointer hover:scale-105 hover:shadow-lg transition-all duration-200", hour.colorClass)}>{hour.value}</div>
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

import React, { useEffect, useState, useCallback, lazy, Suspense } from "react";
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
const HourlyDetailPopover = lazy(() => import("./HDPopO"));
const DepartureDetailPopover = lazy(() => import("./DDPopO"));
import ProjectedHourlyPopover from "./PHPopO";
const HourGraphDialog = lazy(() => import("./HgDi"));
import LaserPulseBorder from "./LPB";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/PopO";
const SecurityTimeGraph = lazy(() => import("./SecurityTimeGraph"));
import { getSecurityViewMode } from "@/lib/cookies";

const ProjectedHourChart = lazy(() =>
  Promise.all([
    import("recharts/es6/chart/AreaChart"),
    import("recharts/es6/component/ResponsiveContainer"),
    import("recharts/es6/cartesian/Area"),
    import("recharts/es6/cartesian/XAxis"),
    import("recharts/es6/cartesian/YAxis"),
    import("recharts/es6/component/Tooltip"),
    import("recharts/es6/cartesian/CartesianGrid"),
  ]).then(([AreaChartMod, RCMod, AreaMod, XMod, YMod, TtMod, CGMod]) => ({
    default: ({ data }: { data: { minute: number; median: number; p10: number; p25: number; p75: number; p90: number }[] }) => (
      <div className="h-28 w-full">
        <RCMod.ResponsiveContainer width="100%" height="100%">
          <AreaChartMod.AreaChart data={data} margin={{ top: 5, right: 5, left: 5, bottom: 5 }}>
            <CGMod.CartesianGrid strokeDasharray="3 3" vertical={false} />
            <XMod.XAxis dataKey="minute" tickFormatter={(v: number) => `${v}m`} axisLine={false} tickLine={false} fontSize={9} />
            <YMod.YAxis tickFormatter={(v: number) => `${v}m`} axisLine={false} tickLine={false} fontSize={9} />
            <TtMod.Tooltip
              formatter={(value: number, name: string) => {
                const labels: Record<string, string> = { median: "Median", p10: "P10", p90: "P90" };
                return [`${value}m`, labels[name] || name];
              }}
              labelFormatter={(l: string) => `Minute ${l}`}
            />
            <AreaMod.Area type="monotone" dataKey="p90" stroke="none" fill="#7c3aed" fillOpacity={0.1} />
            <AreaMod.Area type="monotone" dataKey="p75" stroke="none" fill="#7c3aed" fillOpacity={0.15} />
            <AreaMod.Area type="monotone" dataKey="median" stroke="#7c3aed" strokeWidth={2} fill="#7c3aed" fillOpacity={0.05} strokeDasharray="4 3" />
            <AreaMod.Area type="monotone" dataKey="p25" stroke="none" fill="transparent" />
            <AreaMod.Area type="monotone" dataKey="p10" stroke="none" fill="transparent" />
          </AreaChartMod.AreaChart>
        </RCMod.ResponsiveContainer>
      </div>
    )
  }))
);

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

interface ProjectedHourData {
  hourLabel: string;
  hourOffset: number;
  timestamp: string;
  avgMedian: number | null;
  departures: number;
  minutes: {
    minute: number;
    median: number;
    p10: number;
    p25: number;
    p75: number;
    p90: number;
  }[];
}

interface TerminalSecurityCardProps {
  terminalId: 1 | 2;
  globalMaxTime?: number | null;
  isAutoRefreshing: boolean;
  t1CurrentTime: number | null;
  t2CurrentTime: number | null;
  isSecurityOpen?: boolean;
  isOtherTerminalOpen?: boolean;
}

const ProjectedHourCard: React.FC<{ hour: ProjectedHourData }> = ({ hour }) => {
  const [open, setOpen] = useState(false);
  const colorCls = projectedColorClass(hour.avgMedian);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <div
          onMouseEnter={() => setOpen(true)}
          onMouseLeave={() => setOpen(false)}
          className={cn(
            "flex flex-col items-center justify-center p-1 rounded-sm text-white font-bold cursor-pointer",
            "hover:scale-105 hover:shadow-lg transition-all duration-200 border border-dashed border-white/30",
            colorCls
          )}
        >
          <span className="text-xs">{hour.hourLabel}</span>
          <span className="text-xs">{hour.avgMedian !== null ? `${hour.avgMedian}m` : "—"}</span>
        </div>
      </PopoverTrigger>
      <PopoverContent className="w-72 p-3 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg shadow-lg text-sm">
        <h4 className="font-semibold mb-1 text-center">{hour.hourLabel} (projected)</h4>
        <p className="text-xs text-muted-foreground text-center mb-2">
          {hour.departures} departures nearby · median ~{hour.avgMedian ?? "—"}m
        </p>
        {hour.minutes.length > 0 ? (
          <Suspense fallback={<div className="h-28 w-full flex items-center justify-center"><Loader2 className="h-4 w-4 animate-spin" /></div>}>
            <ProjectedHourChart data={hour.minutes} />
          </Suspense>
        ) : (
          <p className="text-center text-muted-foreground text-xs py-4">No minute data.</p>
        )}
        <p className="text-xs text-muted-foreground text-center mt-1 italic">Dashed = projected median · shaded = confidence band</p>
      </PopoverContent>
    </Popover>
  );
};

function projectedColorClass(value: number | null): string {
  if (value === null) return "bg-gray-500";
  if (value <= 5) return "bg-blue-500";
  if (value <= 10) return "bg-blue-600";
  if (value <= 20) return "bg-indigo-500";
  if (value <= 30) return "bg-indigo-600";
  if (value <= 45) return "bg-purple-600";
  return "bg-purple-800";
}

const TerminalSecurityCard: React.FC<TerminalSecurityCardProps> = ({ terminalId, globalMaxTime, isAutoRefreshing, t1CurrentTime, t2CurrentTime, isSecurityOpen = true, isOtherTerminalOpen = true }) => {
  const [currentTime, setCurrentTime] = useState<number | null>(null);
  const [lastUpdated, setLastUpdated] = useState<string | null>(null);
  const [historicalDailyAverages, setHistoricalDailyAverages] = useState<
    { date: string; t1Average: number | null }[]
  >([]);
  const [currentDayHourlyData, setCurrentDayHourlyData] = useState<HourlySecurityData[]>([]);
  const [granularByHour, setGranularByHour] = useState<Record<number, GranularSecurityData[]>>({});
  const [departureData, setDepartureData] = useState<HourlyDepartureDisplayData[]>([]);
  const [hourlyGranularDepartureData, setHourlyGranularDepartureData] = useState<Map<string, Map<number, GranularDepartureData[]>>>(new Map());
  const [projected6h, setProjected6h] = useState<ProjectedHourData[]>([]);
  const [loading, setLoading] = useState(true);
  const [manualRefreshing, setManualRefreshing] = useState(false);
  const [hourGraphOpen, setHourGraphOpen] = useState(false);
  const isMobile = useIsMobile();
  const [viewMode] = useState<'graph' | 'tiles'>(getSecurityViewMode);

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
        hourlyGranularMap.forEach((records) => {
          records.sort((a, b) => parseISO(a.timestamp).getTime() - parseISO(b.timestamp).getTime());
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

      try {
        const proj = await apiClient.getProjected6h(terminalId);
        setProjected6h(proj.hours || []);
      } catch (err) {
        console.error(`Error fetching projected 6h for T${terminalId}:`, err);
        setProjected6h([]);
      }
    } catch (error) {
      console.error(`Error fetching data for Terminal ${terminalId}:`, error);
      showError(`Failed to load data for Terminal ${terminalId}.`);
      setCurrentTime(null);
      setLastUpdated(null);
      setHistoricalDailyAverages([]);
      setCurrentDayHourlyData([]);
      setGranularByHour({});
      setProjected6h([]);
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

  const cardBorderColorClass = !isSecurityOpen ? "border-red-600" : shouldBeGreenStyled ? "border-custom-green" : "border-departure-orange";
  const cardHeaderBgClass = !isSecurityOpen ? "bg-red-600" : shouldBeGreenStyled ? "bg-custom-green" : "bg-departure-orange";
  const currentTimeColorClass = !isSecurityOpen ? "text-red-600" : shouldBeGreenStyled ? "text-custom-green" : "text-departure-orange";

  const isOnlyTerminalOpen = isSecurityOpen && !isOtherTerminalOpen;

  if (areTimesEqual) {
    if (terminalId === 1) { chatBubbleMessage = "Pick me!"; chatBubbleEmoji = "😃"; chatBubbleClassName += " animate-bounce-twice"; }
    else { chatBubbleMessage = "It doesn't even matter"; chatBubbleEmoji = "🤷‍♂️"; }
  } else if (isT1Quicker && terminalId === 1) { chatBubbleMessage = "Pick me!"; chatBubbleEmoji = "😃"; chatBubbleClassName += " animate-bounce-twice"; }
  else if (isT2Quicker && terminalId === 2) { chatBubbleMessage = "Pick me!"; chatBubbleEmoji = "😃"; chatBubbleClassName += " animate-bounce-twice"; }
  else if (isT1Quicker && terminalId === 2 && !isOnlyTerminalOpen) { chatBubbleMessage = "Ah sure, I'm usually the fast one"; chatBubbleEmoji = "🥲"; chatBubbleClassName += " bg-red-600 before:border-t-red-600"; }
  else if (isT2Quicker && terminalId === 1 && !isOnlyTerminalOpen) { chatBubbleMessage = "Feck sake..."; chatBubbleEmoji = "🥲"; chatBubbleClassName += " bg-red-600 before:border-t-red-600"; }

  return (
    <LaserPulseBorder
      active={manualRefreshing || isAutoRefreshing}
      config={{
        color: !isSecurityOpen ? "#DC2626" : shouldBeGreenStyled ? "#4CAF50" : "#FF8000",
        duration: 600,
        pulseWidth: 50,
        bulgeAmount: 4,
        bulgeSpread: 36,
        borderRadius: 8,
      }}
      className="w-full"
    >
    <Card className={cn("w-full border-2 rounded-lg shadow-lg relative", cardBorderColorClass)}>
      {!isSecurityOpen && (
        <ChatBubble message="Im closed rn" emoji="🚫" className="-top-12 bg-red-600 before:border-t-red-600" />
      )}
      {isSecurityOpen && chatBubbleMessage && (
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
          <>
            <div
              className={cn("cursor-pointer", !loading ? "hover:opacity-80 transition-opacity" : "opacity-50")}
              onClick={() => !loading && setHourGraphOpen(true)}
              title={loading ? undefined : "Click for detailed hour graph"}
            >
              <p className={cn("text-7xl font-extrabold mb-2", currentTimeColorClass)}>
                {!isSecurityOpen && currentTime === 0 ? "C" : currentTime !== null ? currentTime : "—"}
              </p>
              <p className={cn("text-2xl font-semibold mb-4", currentTimeColorClass)}>
                {!isSecurityOpen && currentTime === 0 ? "closed" : "minutes"}
              </p>
            </div>
            <p className="text-sm text-gray-500 dark:text-gray-400 mb-8">
              {loading ? "Loading..." : <>Last updated {timeSinceLastUpdate !== null ? `${timeSinceLastUpdate} minutes ago` : "N/A"}</>}
            </p>
            <div className="mb-4">
              <ProjectedHourlyPopover terminalId={terminalId} currentTime={currentTime} />
            </div>

            {hourGraphOpen && (
              <Suspense fallback={null}>
                <HourGraphDialog
                  open={hourGraphOpen}
                  onOpenChange={setHourGraphOpen}
                  terminalId={terminalId}
                  currentTime={currentTime}
                />
              </Suspense>
            )}

            <div className="mb-8 w-full">
              <h3 className="text-md font-semibold text-gray-700 dark:text-gray-200 mb-4">{viewMode === 'graph' ? 'Past 7d / Next 6h' : 'Past 24 / Next 6'}</h3>
              {viewMode === 'graph' ? (
                <Suspense fallback={<Skeleton className="h-[175px] w-full" />}>
                  <SecurityTimeGraph
                    terminalId={terminalId}
                  />
                </Suspense>
              ) : currentDayHourlyData.length > 0 ? (
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
                  {projected6h.map((hour) => (
                    <ProjectedHourCard key={`proj-${hour.hourOffset}`} hour={hour} />
                  ))}
                </div>
              ) : (
                <p className="text-center text-muted-foreground text-sm">{loading ? "\u00A0" : "No hourly data for the last 24 hours."}</p>
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
                      <p className="text-center text-muted-foreground text-sm">{loading ? "\u00A0" : "No departure data available."}</p>
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
                  <p className="text-center text-muted-foreground text-sm">{loading ? "\u00A0" : "No departure data available."}</p>
                )}
              </div>
            )}
          </>
      </CardContent>
    </Card>
    </LaserPulseBorder>
  );
};

export default TerminalSecurityCard;

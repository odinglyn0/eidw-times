import React, { useEffect, useState, useCallback } from "react";
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
import { supabase } from "@/integrations/supabase/client";
import { Skeleton } from "@/components/ui/skeleton";
import { showError } from "@/utils/toast";
import { format, subDays, differenceInMinutes, getHours } from "date-fns";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { RefreshCw, Loader2 } from "lucide-react";

interface SecurityTimeData {
  timestamp: string;
  t1: number | null;
  t2: number | null;
}

interface CurrentSecurityTimes {
  t1: number | null;
  t2: number | null;
  last_updated: string | null;
}

interface HourlyDepartureDisplayData {
  date: string; // e.g., "TODAY", "MON, JUL 1"
  hours: { value: number; colorClass: string }[]; // 24 entries for each hour
}

interface TerminalSecurityCardProps {
  terminalId: 1 | 2;
}

const TerminalSecurityCard: React.FC<TerminalSecurityCardProps> = ({ terminalId }) => {
  const [currentTime, setCurrentTime] = useState<number | null>(null);
  const [lastUpdated, setLastUpdated] = useState<string | null>(null);
  const [historicalData, setHistoricalData] = useState<SecurityTimeData[]>([]);
  const [departureData, setDepartureData] = useState<HourlyDepartureDisplayData[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchDepartureData = useCallback(async () => {
    try {
      console.log(`Fetching departure data for Terminal ${terminalId} from 'departures' table...`);
      const threeDaysAgo = subDays(new Date(), 3).toISOString();
      const { data, error } = await supabase
        .from("departures") // Fetching from the new 'departures' table
        .select("departure_datetime, departure_count")
        .eq("terminal_id", terminalId)
        .gte("departure_datetime", threeDaysAgo)
        .order("departure_datetime", { ascending: true });

      if (error) {
        console.error(`Supabase departure data error for T${terminalId}:`, error);
        throw error;
      }
      console.log(`Raw departure data for T${terminalId}:`, data);

      const processedData: HourlyDepartureDisplayData[] = [];
      const today = new Date();
      const datesToProcess = [today, subDays(today, 1), subDays(today, 2)];

      datesToProcess.forEach((date, index) => {
        const dayString = index === 0 ? "TODAY" : format(date, "EEE, MMM do").toUpperCase();
        const hourlyCounts: number[] = Array(24).fill(0);

        data.forEach(item => {
          const itemDate = new Date(item.departure_datetime);
          if (format(itemDate, 'yyyy-MM-dd') === format(date, 'yyyy-MM-dd')) {
            const hour = getHours(itemDate);
            // Assuming departure_count is for the specific hour
            hourlyCounts[hour] = item.departure_count;
          }
        });

        const hoursWithColors = hourlyCounts.map(count => {
          let colorClass = "bg-green-500";
          if (count > 10 && count <= 15) colorClass = "bg-orange-500";
          if (count > 15) colorClass = "bg-red-500";
          return { value: count, colorClass };
        });

        processedData.push({ date: dayString, hours: hoursWithColors });
      });

      setDepartureData(processedData);
    } catch (error) {
      console.error(`Error fetching departure data for Terminal ${terminalId}:`, error);
      setDepartureData([]);
    }
  }, [terminalId]);

  const fetchSecurityData = useCallback(async () => {
    setLoading(true);
    setRefreshing(true);
    try {
      console.log(`Fetching current data for Terminal ${terminalId}...`);
      // Fetch current times
      const { data: currentData, error: currentError } = await supabase
        .from("security_times_current")
        .select(`t${terminalId}, last_updated`)
        .eq("id", 1)
        .single();

      if (currentError) {
        console.error(`Supabase current data error for T${terminalId}:`, currentError);
        throw currentError;
      }
      console.log(`Current data for T${terminalId}:`, currentData);

      setCurrentTime(currentData[`t${terminalId}`]);
      setLastUpdated(currentData.last_updated);

      console.log(`Fetching historical data for Terminal ${terminalId}...`);
      // Fetch historical data for the last 7 days
      const sevenDaysAgo = subDays(new Date(), 7).toISOString();
      const { data: historical, error: historicalError } = await supabase
        .from("security_times")
        .select(`timestamp, t${terminalId}`)
        .gte("timestamp", sevenDaysAgo)
        .order("timestamp", { ascending: true });

      if (historicalError) {
        console.error(`Supabase historical data error for T${terminalId}:`, historicalError);
        throw historicalError;
      }
      console.log(`Historical data for T${terminalId}:`, historical);

      const formattedHistoricalData = historical.map((item) => ({
        timestamp: format(new Date(item.timestamp), "EEE d"),
        [`t${terminalId}`]: item[`t${terminalId}`],
      }));
      setHistoricalData(formattedHistoricalData);

    } catch (error) {
      console.error(`Error fetching data for Terminal ${terminalId}:`, error);
      showError(`Failed to load data for Terminal ${terminalId}. Please check console for details.`);
      setCurrentTime(null);
      setLastUpdated(null);
      setHistoricalData([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [terminalId]);

  useEffect(() => {
    fetchSecurityData();
    fetchDepartureData();
  }, [terminalId, fetchSecurityData, fetchDepartureData]);

  const handleRefresh = () => {
    fetchSecurityData();
    fetchDepartureData();
  };

  const timeSinceLastUpdate = lastUpdated
    ? differenceInMinutes(new Date(), new Date(lastUpdated))
    : null;

  return (
    <Card className="w-full border-2 border-custom-green rounded-lg shadow-lg overflow-hidden">
      <CardHeader className="bg-custom-green p-4 text-white text-center relative">
        <CardTitle className="text-lg font-semibold mb-1">Security queue wait</CardTitle>
        <h2 className="text-3xl font-bold">Terminal {terminalId}</h2>
        <Button
          variant="ghost"
          size="icon"
          onClick={handleRefresh}
          disabled={refreshing}
          className="absolute top-4 right-4 text-white hover:bg-white hover:text-custom-green"
        >
          {refreshing ? (
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
            <p className="text-7xl font-extrabold text-custom-green mb-2">
              {currentTime !== null ? currentTime : "N/A"}
            </p>
            <p className="text-2xl font-semibold text-custom-green mb-4">minutes</p>
            <p className="text-sm text-gray-500 mb-8">
              Last updated {timeSinceLastUpdate !== null ? `${timeSinceLastUpdate} minutes ago` : "N/A"}
            </p>

            <div className="mb-8">
              <h3 className="text-md font-semibold text-gray-700 mb-2">Last 7 Days</h3>
              {historicalData.length > 0 ? (
                <ResponsiveContainer width="100%" height={150}>
                  <LineChart data={historicalData}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} />
                    <XAxis dataKey="timestamp" axisLine={false} tickLine={false} />
                    <YAxis
                      domain={[0, 60]}
                      ticks={[15, 30, 45, 60]}
                      tickFormatter={(value) => `${value}m`}
                      width={30}
                      axisLine={false}
                      tickLine={false}
                    />
                    <Tooltip />
                    <Line
                      type="monotone"
                      dataKey={`t${terminalId}`}
                      stroke="#82ca9d"
                      strokeWidth={2}
                      dot={false}
                    />
                  </LineChart>
                </ResponsiveContainer>
              ) : (
                <p className="text-center text-muted-foreground text-sm">No historical data for last 7 days.</p>
              )}
            </div>

            <div>
              <h3 className="text-md font-semibold text-gray-700 mb-4">Number of Departures</h3>
              {departureData.length > 0 ? (
                departureData.map((day, dayIndex) => (
                  <div key={dayIndex} className="mb-4 last:mb-0">
                    <p className="text-xs font-medium text-gray-500 mb-2">{day.date}</p>
                    <div className="grid grid-cols-12 gap-1">
                      {day.hours.slice(0, 12).map((hour, hourIndex) => (
                        <div
                          key={hourIndex}
                          className={cn(
                            "w-6 h-6 flex items-center justify-center text-white text-xs font-bold rounded-sm",
                            hour.colorClass
                          )}
                        >
                          {hour.value}
                        </div>
                      ))}
                    </div>
                    <div className="grid grid-cols-12 gap-1 mt-1">
                      {day.hours.slice(12, 24).map((hour, hourIndex) => (
                        <div
                          key={hourIndex + 12}
                          className={cn(
                            "w-6 h-6 flex items-center justify-center text-white text-xs font-bold rounded-sm",
                            hour.colorClass
                          )}
                        >
                          {hour.value}
                        </div>
                      ))}
                    </div>
                  </div>
                ))
              ) : (
                <p className="text-center text-muted-foreground text-sm">No departure data available.</p>
              )}
              <p className="text-xs text-gray-500 mt-4">
                This data is fetched from the 'departures' table in your Supabase database.
              </p>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
};

export default TerminalSecurityCard;
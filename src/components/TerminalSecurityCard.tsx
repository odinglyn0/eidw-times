import React, { useEffect, useState } from "react";
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
import { format, subDays, differenceInMinutes } from "date-fns";
import { cn } from "@/lib/utils";

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

interface TerminalSecurityCardProps {
  terminalId: 1 | 2;
}

const TerminalSecurityCard: React.FC<TerminalSecurityCardProps> = ({ terminalId }) => {
  const [currentTime, setCurrentTime] = useState<number | null>(null);
  const [lastUpdated, setLastUpdated] = useState<string | null>(null);
  const [historicalData, setHistoricalData] = useState<SecurityTimeData[]>([]);
  const [loading, setLoading] = useState(true);

  // Dummy data for "Number of Departures" as it's not in the provided schema
  const generateDepartureData = () => {
    const data = [];
    const today = new Date();
    const yesterday = subDays(today, 1);
    const dayBeforeYesterday = subDays(today, 2);

    const generateHourlyData = () => {
      const hours = [];
      for (let i = 0; i < 24; i++) {
        const value = Math.floor(Math.random() * 20); // Random departures
        let colorClass = "bg-green-500";
        if (value > 10 && value <= 15) colorClass = "bg-orange-500";
        if (value > 15) colorClass = "bg-red-500";
        hours.push({ value, colorClass });
      }
      return hours;
    };

    data.push({ date: "TODAY", hours: generateHourlyData() });
    data.push({ date: format(yesterday, "EEE, MMM do").toUpperCase(), hours: generateHourlyData() });
    data.push({ date: format(dayBeforeYesterday, "EEE, MMM do").toUpperCase(), hours: generateHourlyData() });
    return data;
  };

  const departureData = generateDepartureData();

  const fetchSecurityData = async () => {
    setLoading(true);
    try {
      // Fetch current times
      const { data: currentData, error: currentError } = await supabase
        .from("security_times_current")
        .select(`t${terminalId}, last_updated`)
        .eq("id", 1)
        .single();

      if (currentError) {
        throw currentError;
      }

      setCurrentTime(currentData[`t${terminalId}`]);
      setLastUpdated(currentData.last_updated);

      // Fetch historical data for the last 7 days
      const sevenDaysAgo = subDays(new Date(), 7).toISOString();
      const { data: historical, error: historicalError } = await supabase
        .from("security_times")
        .select(`timestamp, t${terminalId}`)
        .gte("timestamp", sevenDaysAgo)
        .order("timestamp", { ascending: true });

      if (historicalError) {
        throw historicalError;
      }

      const formattedHistoricalData = historical.map((item) => ({
        timestamp: format(new Date(item.timestamp), "EEE"), // Format for chart X-axis (MON, TUE, etc.)
        [`t${terminalId}`]: item[`t${terminalId}`],
      }));
      setHistoricalData(formattedHistoricalData);

    } catch (error) {
      console.error(`Error fetching data for Terminal ${terminalId}:`, error);
      showError(`Failed to load data for Terminal ${terminalId}.`);
      setCurrentTime(null);
      setLastUpdated(null);
      setHistoricalData([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSecurityData();
  }, [terminalId]);

  const timeSinceLastUpdate = lastUpdated
    ? differenceInMinutes(new Date(), new Date(lastUpdated))
    : null;

  return (
    <Card className="w-full border-2 border-custom-green rounded-lg shadow-lg overflow-hidden">
      <CardHeader className="bg-custom-green p-4 text-white text-center">
        <CardTitle className="text-lg font-semibold mb-1">Security queue wait</CardTitle>
        <h2 className="text-3xl font-bold">Terminal {terminalId}</h2>
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
                      stroke="#82ca9d" // Green for the line
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
              {departureData.map((day, dayIndex) => (
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
              ))}
              <p className="text-xs text-gray-500 mt-4">
                Note: "Number of Departures" data is simulated as it's not available in the provided schema.
              </p>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
};

export default TerminalSecurityCard;
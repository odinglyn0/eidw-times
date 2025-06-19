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
  Legend,
} from "recharts";
import { supabase } from "@/integrations/supabase/client";
import { Skeleton } from "@/components/ui/skeleton";
import { showError } from "@/utils/toast";
import { format, subMonths } from "date-fns";

interface SecurityTimeData {
  timestamp: string;
  t1: number | null;
  t2: number | null;
}

const SecurityTimesChart: React.FC = () => {
  const [data, setData] = useState<SecurityTimeData[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchHistoricalData = async () => {
      setLoading(true);
      try {
        const threeMonthsAgo = subMonths(new Date(), 3).toISOString();
        const { data, error } = await supabase
          .from("security_times")
          .select("timestamp, t1, t2")
          .gte("timestamp", threeMonthsAgo)
          .order("timestamp", { ascending: true });

        if (error) {
          throw error;
        }

        const formattedData = data.map((item) => ({
          ...item,
          timestamp: format(new Date(item.timestamp), "MMM dd"), // Format for display
        }));
        setData(formattedData);
      } catch (error) {
        console.error("Error fetching historical data:", error);
        showError("Failed to load historical security times.");
        setData([]);
      } finally {
        setLoading(false);
      }
    };

    fetchHistoricalData();
  }, []);

  return (
    <Card className="w-full max-w-3xl mx-auto mt-8">
      <CardHeader>
        <CardTitle>Security Times Analytics (Last 3 Months)</CardTitle>
      </CardHeader>
      <CardContent>
        {loading ? (
          <Skeleton className="h-[300px] w-full" />
        ) : data.length > 0 ? (
          <ResponsiveContainer width="100%" height={300}>
            <LineChart
              data={data}
              margin={{
                top: 5,
                right: 30,
                left: 20,
                bottom: 5,
              }}
            >
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="timestamp" />
              <YAxis label={{ value: 'Minutes', angle: -90, position: 'insideLeft' }} />
              <Tooltip />
              <Legend />
              <Line type="monotone" dataKey="t1" stroke="#8884d8" activeDot={{ r: 8 }} name="Terminal 1" />
              <Line type="monotone" dataKey="t2" stroke="#82ca9d" name="Terminal 2" />
            </LineChart>
          </ResponsiveContainer>
        ) : (
          <p className="text-center text-muted-foreground">No historical data available for the last 3 months.</p>
        )}
      </CardContent>
    </Card>
  );
};

export default SecurityTimesChart;
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { format, subDays, startOfDay, getHours, parseISO, addHours } from "https://esm.sh/date-fns@3.6.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_ANON_KEY") ?? "",
      {
        global: {
          headers: { Authorization: req.headers.get("Authorization")! },
        },
      },
    );

    const today = new Date();
    const sevenDaysAgo = subDays(startOfDay(today), 6); // Start of day 7 days ago

    const { data, error } = await supabase
      .from("security_times")
      .select("timestamp, t1, t2")
      .gte("timestamp", sevenDaysAgo.toISOString())
      .order("timestamp", { ascending: true });

    if (error) {
      console.error("Supabase query error:", error);
      return new Response(JSON.stringify({ error: error.message }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 500,
      });
    }

    console.log("Raw data from security_times:", data);

    // Organize data by day and hour, taking the latest entry for each hour (with +1 hour timezone fix)
    const dailyHourlyDataMap = new Map<string, Map<number, { t1: number | null; t2: number | null; timestamp: string }>>();

    data.forEach((item) => {
      const itemDateUTC = parseISO(item.timestamp);
      const itemDateLocal = addHours(itemDateUTC, 1); // Shift UTC to Ireland local time (UTC+1)
      const dateKey = format(itemDateLocal, "yyyy-MM-dd");
      const hour = getHours(itemDateLocal);

      if (!dailyHourlyDataMap.has(dateKey)) {
        dailyHourlyDataMap.set(dateKey, new Map());
      }
      const hourlyMap = dailyHourlyDataMap.get(dateKey);
      const existing = hourlyMap?.get(hour);
      // Keep only the latest entry per hour based on the original UTC timestamp
      if (!existing || itemDateUTC > parseISO(existing.timestamp)) { // Compare original UTC timestamps for "latest"
        hourlyMap?.set(hour, {
          t1: item.t1,
          t2: item.t2,
          timestamp: itemDateLocal.toISOString(), // Store the adjusted local time ISO string
        });
      }
    });

    // Create a complete list of the last 7 days with 24 hourly slots
    const historicalData = [];
    for (let i = 6; i >= 0; i--) {
      const date = subDays(today, i);
      const dateKey = format(date, "yyyy-MM-dd");
      const hourlyData = [];
      const currentDayHourlyMap = dailyHourlyDataMap.get(dateKey) || new Map();

      for (let hour = 0; hour < 24; hour++) {
        const record = currentDayHourlyMap.get(hour);
        hourlyData.push({
          hour,
          t1: record ? record.t1 : null,
          t2: record ? record.t2 : null,
          timestamp: record ? record.timestamp : null, // Include the adjusted timestamp
        });
      }
      historicalData.push({ date: dateKey, hourlyData });
    }

    console.log("Processed historical data (7 days, oldest to newest, with hourly data):", historicalData);

    return new Response(JSON.stringify(historicalData), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });
  } catch (error) {
    console.error("Edge Function error:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    });
  }
});
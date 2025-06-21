import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { subDays, startOfDay, getHours, parseISO } from "https://esm.sh/date-fns@3.6.0";
import { utcToZonedTime, formatInTimeZone } from "https://esm.sh/date-fns-tz@2.0.0?deps=date-fns@3.6.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const IRELAND_TIMEZONE = 'Europe/Dublin';

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

    // Get current time in Ireland timezone for query range
    const nowInIreland = utcToZonedTime(new Date(), IRELAND_TIMEZONE);
    const todayInIreland = startOfDay(nowInIreland);
    const sevenDaysAgoInIreland = subDays(todayInIreland, 6);

    const { data, error } = await supabase
      .from("security_times")
      .select("timestamp, t1, t2")
      .gte("timestamp", sevenDaysAgoInIreland.toISOString()) // Query using IST-aligned start date
      .order("timestamp", { ascending: true });

    if (error) {
      console.error("Supabase query error:", error);
      return new Response(JSON.stringify({ error: error.message }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 500,
      });
    }

    console.log("Raw data from security_times:", data);

    const dailyHourlyDataMap = new Map<string, Map<number, { t1: number | null; t2: number | null }>>();

    data.forEach((item) => {
      const itemDate = parseISO(item.timestamp); // This is UTC
      const itemDateInIreland = utcToZonedTime(itemDate, IRELAND_TIMEZONE); // Convert to IST

      const dateKey = formatInTimeZone(itemDateInIreland, IRELAND_TIMEZONE, "yyyy-MM-dd"); // IST date key
      const hour = getHours(itemDateInIreland); // IST hour

      if (!dailyHourlyDataMap.has(dateKey)) {
        dailyHourlyDataMap.set(dateKey, new Map());
      }
      // Always store the latest entry for that hour
      dailyHourlyDataMap.get(dateKey)?.set(hour, { t1: item.t1, t2: item.t2 });
    });

    const historicalData = [];
    for (let i = 6; i >= 0; i--) {
      const date = subDays(todayInIreland, i); // Use IST-aligned date
      const dateKey = formatInTimeZone(date, IRELAND_TIMEZONE, "yyyy-MM-dd"); // IST date key
      const hourlyData = [];
      const currentDayHourlyMap = dailyHourlyDataMap.get(dateKey) || new Map();

      for (let hour = 0; hour < 24; hour++) {
        hourlyData.push({
          hour,
          t1: currentDayHourlyMap.has(hour) ? currentDayHourlyMap.get(hour)?.t1 : null,
          t2: currentDayHourlyMap.has(hour) ? currentDayHourlyMap.get(hour)?.t2 : null,
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
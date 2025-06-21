import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { setHours, setMinutes, setSeconds, setMilliseconds, parseISO } from "https://esm.sh/date-fns@3.6.0";
import { zonedTimeToUtc } from "https://esm.sh/date-fns-tz@2.0.0?deps=date-fns@3.6.0";

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
    const { terminalId, dateKey, hour } = await req.json(); // Receive dateKey (IST) and hour (IST)

    if (!terminalId || dateKey === undefined || hour === undefined) {
      return new Response(JSON.stringify({ error: "Missing terminalId, dateKey, or hour in request body." }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 400,
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_ANON_KEY") ?? "",
      {
        global: {
          headers: { Authorization: req.headers.get("Authorization")! },
        },
      },
    );

    // Construct the target date in Ireland timezone
    let targetDateInIreland = parseISO(dateKey); // Parses as local date, e.g., 2024-07-30 00:00:00 local
    targetDateInIreland = setHours(targetDateInIreland, hour);
    targetDateInIreland = setMinutes(targetDateInIreland, 0);
    targetDateInIreland = setSeconds(targetDateInIreland, 0);
    targetDateInIreland = setMilliseconds(targetDateInIreland, 0);

    // Convert this Ireland-local date to UTC for the Supabase query
    // This assumes the database stores timestamps in UTC
    const startOfTargetHourUTC = zonedTimeToUtc(targetDateInIreland, IRELAND_TIMEZONE);
    const endOfTargetHourUTC = zonedTimeToUtc(setHours(targetDateInIreland, hour + 1), IRELAND_TIMEZONE); // End of the hour

    const { data, error } = await supabase
      .from("security_times")
      .select("timestamp, t1, t2")
      .gte("timestamp", startOfTargetHourUTC.toISOString())
      .lte("timestamp", endOfTargetHourUTC.toISOString())
      .order("timestamp", { ascending: true });

    if (error) {
      console.error("Supabase query error in get-hourly-interval-security-data:", error);
      return new Response(JSON.stringify({ error: error.message }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 500,
      });
    }

    console.log(`Data from security_times for T${terminalId} within hour ${dateKey} ${hour}:00 IST:`, data);

    // Filter data for the specific terminal and ensure timestamps are formatted for client
    const filteredData = data.map(item => ({
      timestamp: item.timestamp, // Keep as UTC for client to parse
      time: item[`t${terminalId}`],
    }));

    return new Response(JSON.stringify(filteredData), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });
  } catch (error) {
    console.error("Edge Function error in get-hourly-interval-security-data:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    });
  }
});
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { startOfHour, endOfHour, parseISO } from "https://esm.sh/date-fns@3.6.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { terminalId, targetTimestamp } = await req.json(); // targetTimestamp will be like '2024-07-26T10:00:00Z'

    if (!terminalId || !targetTimestamp) {
      return new Response(JSON.stringify({ error: "Missing terminalId or targetTimestamp in request body." }), {
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

    const startOfTargetHour = startOfHour(parseISO(targetTimestamp));
    const endOfTargetHour = endOfHour(parseISO(targetTimestamp));

    const { data, error } = await supabase
      .from("departures")
      .select("departure_datetime, departure_count")
      .eq("terminal_id", terminalId)
      .gte("departure_datetime", startOfTargetHour.toISOString())
      .lte("departure_datetime", endOfTargetHour.toISOString())
      .order("departure_datetime", { ascending: true });

    if (error) {
      console.error("Supabase query error in get-hourly-interval-departure-data:", error);
      return new Response(JSON.stringify({ error: error.message }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 500,
      });
    }

    console.log(`Data from departures for T${terminalId} within hour ${targetTimestamp}:`, data);

    // Map data to a simpler format for the chart
    const filteredData = data.map(item => ({
      timestamp: item.departure_datetime,
      count: item.departure_count,
    }));

    return new Response(JSON.stringify(filteredData), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });
  } catch (error) {
    console.error("Edge Function error in get-hourly-interval-departure-data:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    });
  }
});
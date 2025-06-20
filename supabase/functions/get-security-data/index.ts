import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { format, subDays } from "https://esm.sh/date-fns@3.6.0";

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
    const sevenDaysAgo = subDays(today, 6); // Get data for today and the past 6 days

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

    // Generate a map of data for the last 7 days, keyed by formatted date
    const dailyDataMap = new Map();
    data.forEach((item) => {
      const dateKey = format(new Date(item.timestamp), "yyyy-MM-dd");
      // For simplicity, taking the last recorded value for the day if multiple exist
      dailyDataMap.set(dateKey, {
        formattedDate: dateKey,
        t1: item.t1,
        t2: item.t2,
      });
    });

    // Create a complete list of the last 7 days, filling in nulls for missing days
    const historicalData = [];
    for (let i = 6; i >= 0; i--) {
      const date = subDays(today, i);
      const dateKey = format(date, "yyyy-MM-dd");
      historicalData.push(
        dailyDataMap.get(dateKey) || {
          formattedDate: dateKey,
          t1: null,
          t2: null,
        },
      );
    }

    console.log("Processed historical data (7 days, oldest to newest):", historicalData);

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
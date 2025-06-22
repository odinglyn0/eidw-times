import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { subDays, startOfDay, parseISO, addHours } from "https://esm.sh/date-fns@3.6.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Create a Supabase client with the service role key
    // This bypasses RLS and allows fetching data regardless of user authentication
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "", // Use service role key
      {
        auth: {
          persistSession: false, // No session needed for service role
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
      console.error("Supabase query error in get-7-day-security-data:", error);
      return new Response(JSON.stringify({ error: error.message }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 500,
      });
    }

    console.log("Raw data from security_times for 7 days:", data);

    // Adjust timestamps to local Irish time (UTC+1) before sending to client
    const processedData = data.map(item => {
      const itemDateUTC = parseISO(item.timestamp);
      const itemDateLocal = addHours(itemDateUTC, 1); // Shift UTC to Ireland local time (UTC+1)
      return {
        timestamp: itemDateLocal.toISOString(), // Store the adjusted local time ISO string
        t1: item.t1,
        t2: item.t2,
      };
    });

    console.log("Processed 7-day historical data (local time adjusted):", processedData);

    return new Response(JSON.stringify(processedData), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });
  } catch (error) {
    console.error("Edge Function error in get-7-day-security-data:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    });
  }
});
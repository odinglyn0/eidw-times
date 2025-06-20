import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';
import { format, subDays, startOfDay } from 'https://esm.sh/date-fns@3.6.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      {
        global: {
          headers: { Authorization: req.headers.get('Authorization')! },
        },
      }
    );

    // Fetch data for the last 14 days to ensure we have enough to pick the latest for each of the last 7.
    const fourteenDaysAgo = subDays(new Date(), 14).toISOString(); 
    const { data: historical, error: historicalError } = await supabase
      .from("security_times")
      .select(`timestamp, t1, t2`)
      .gte("timestamp", fourteenDaysAgo)
      .order("timestamp", { ascending: true }); // Order by timestamp to easily pick the latest

    if (historicalError) {
      console.error("Supabase historical data error:", historicalError);
      return new Response(JSON.stringify({ error: historicalError.message }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500,
      });
    }

    const dailyDataMap = new Map<string, { timestamp: Date; t1: number | null; t2: number | null }>();

    historical.forEach(item => {
      const itemDate = new Date(item.timestamp);
      if (isNaN(itemDate.getTime())) {
        console.warn("Invalid date found in historical data:", item.timestamp);
        return;
      }
      const itemDateFormattedKey = format(itemDate, "yyyy-MM-dd");

      const existingEntry = dailyDataMap.get(itemDateFormattedKey);
      // Keep the latest entry for each day
      if (!existingEntry || itemDate.getTime() > existingEntry.timestamp.getTime()) {
        dailyDataMap.set(itemDateFormattedKey, {
          timestamp: itemDate,
          t1: item.t1,
          t2: item.t2,
        });
      }
    });

    const sevenDayChartData: { formattedDate: string; t1: number | null; t2: number | null }[] = [];
    const today = startOfDay(new Date());

    // Populate data for the last 7 days, ensuring one entry per day
    for (let i = 6; i >= 0; i--) { // Iterate from 6 days ago to today
      const dateForDay = startOfDay(subDays(today, i));
      const formattedDateKey = format(dateForDay, "yyyy-MM-dd");
      const dataForThisDay = dailyDataMap.get(formattedDateKey);

      sevenDayChartData.push({
        formattedDate: formattedDateKey,
        t1: dataForThisDay ? dataForThisDay.t1 : null,
        t2: dataForThisDay ? dataForThisDay.t2 : null,
      });
    }

    // Sort by date to ensure correct order for the chart (oldest to newest for "propagate from right")
    sevenDayChartData.sort((a, b) => new Date(a.formattedDate).getTime() - new Date(b.formattedDate).getTime());

    console.log("Edge Function: Final 7-day chart data prepared:", sevenDayChartData);

    return new Response(JSON.stringify(sevenDayChartData), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    });

  } catch (error) {
    console.error("Error in get-security-data function:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 500,
    });
  }
});
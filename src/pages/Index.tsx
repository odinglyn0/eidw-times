import TerminalSecurityCard from "@/components/TerminalSecurityCard";
import { useState, useEffect, useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Loader2, RefreshCw, Settings as SettingsIcon } from "lucide-react"; // Import Settings icon
import { Button } from "@/components/ui/button";
import { differenceInMinutes, parseISO } from "date-fns";
import PhoneNotch from "@/components/PhoneNotch";
import BottomNotch from "@/components/BottomNotch";
import { Link } from "react-router-dom"; // Import Link for navigation
import { getAutoPollEnabled, getAutoPollInterval } from '@/lib/cookies'; // Import cookie utilities

// Define interfaces for historical data structure received from Edge Function
interface HourlySecurityData {
  hour: number;
  t1: number | null;
  t2: number | null;
}

interface DailySecurityData {
  date: string; // yyyy-MM-dd
  hourlyData: HourlySecurityData[];
}

const Index = () => {
  const [t1CurrentTime, setT1CurrentTime] = useState<number | null>(null);
  const [t2CurrentTime, setT2CurrentTime] = useState<number | null>(null);
  const [recommendationLastUpdated, setRecommendationLastUpdated] = useState<string | null>(null);
  const [loadingRecommendation, setLoadingRecommendation] = useState(true);
  const [globalMaxSecurityTime, setGlobalMaxSecurityTime] = useState<number | null>(null);
  const [isAutoRefreshing, setIsAutoRefreshing] = useState(false); // New state for auto-refreshing
  const autoRefreshIntervalId = useRef<number | null>(null);

  const fetchRecommendationData = useCallback(async () => {
    setLoadingRecommendation(true);
    try {
      const { data, error } = await supabase
        .from("security_times_current")
        .select("t1, t2, last_updated")
        .eq("id", 1)
        .single();

      if (error) {
        console.error("Error fetching current security times for recommendation:", error);
        setT1CurrentTime(null);
        setT2CurrentTime(null);
        setRecommendationLastUpdated(null);
      } else {
        setT1CurrentTime(data.t1);
        setT2CurrentTime(data.t2);
        setRecommendationLastUpdated(data.last_updated);
      }
    } catch (err) {
      console.error("Unexpected error fetching recommendation data:", err);
      setT1CurrentTime(null);
      setT2CurrentTime(null);
      setRecommendationLastUpdated(null);
    } finally {
      setLoadingRecommendation(false);
    }
  }, []);

  const fetchGlobalSecurityData = useCallback(async () => {
    try {
      console.log(`Invoking Edge Function 'get-security-data' for global historical data...`);
      const { data: historicalResponse, error: edgeFunctionError } = await supabase.functions.invoke('get-security-data');

      if (edgeFunctionError) {
        console.error(`Edge Function 'get-security-data' error:`, edgeFunctionError);
        throw edgeFunctionError;
      }

      const allHistoricalData: DailySecurityData[] = historicalResponse as DailySecurityData[];
      let maxOverallTime = 0;
      allHistoricalData.forEach(dayData => {
        dayData.hourlyData.forEach(hourData => {
          if (hourData.t1 !== null) maxOverallTime = Math.max(maxOverallTime, hourData.t1);
          if (hourData.t2 !== null) maxOverallTime = Math.max(maxOverallTime, hourData.t2);
        });
      });
      setGlobalMaxSecurityTime(maxOverallTime);
      console.log("Client: Calculated global max security time:", maxOverallTime);
    } catch (error) {
      console.error("Error fetching global security data:", error);
      setGlobalMaxSecurityTime(null);
    }
  }, [terminalId]); // Added terminalId to dependency array for fetchGlobalSecurityData

  // Function to trigger all data fetches
  const refreshAllData = useCallback(async () => {
    setIsAutoRefreshing(true);
    await Promise.all([
      fetchRecommendationData(),
      fetchGlobalSecurityData(),
      // TerminalSecurityCard components will handle their own fetches via their internal useEffects
      // or could be passed a prop to trigger if needed, but current setup is fine.
    ]);
    setIsAutoRefreshing(false);
  }, [fetchRecommendationData, fetchGlobalSecurityData]);

  useEffect(() => {
    refreshAllData(); // Initial fetch on mount

    // Setup auto-refresh based on cookie settings
    const setupAutoRefresh = () => {
      if (autoRefreshIntervalId.current) {
        clearInterval(autoRefreshIntervalId.current);
      }

      const enabled = getAutoPollEnabled();
      const interval = getAutoPollInterval();

      if (enabled && interval > 0) {
        autoRefreshIntervalId.current = setInterval(() => {
          console.log(`Auto-refreshing data every ${interval} seconds...`);
          refreshAllData();
        }, interval * 1000) as unknown as number; // Cast to number for clearInterval
      }
    };

    setupAutoRefresh();

    // Listen for changes in cookie settings (e.g., from Settings page)
    const handleStorageChange = () => {
      setupAutoRefresh();
    };
    window.addEventListener('storage', handleStorageChange); // For cross-tab/window sync

    return () => {
      if (autoRefreshIntervalId.current) {
        clearInterval(autoRefreshIntervalId.current);
      }
      window.removeEventListener('storage', handleStorageChange);
    };
  }, [refreshAllData]);

  const recommendedTerminal = (() => {
    if (t1CurrentTime === null && t2CurrentTime === null) {
      return null;
    }
    if (t1CurrentTime !== null && t2CurrentTime === null) {
      return { id: 1, time: t1CurrentTime };
    }
    if (t1CurrentTime === null && t2CurrentTime !== null) {
      return { id: 2, time: t2CurrentTime };
    }
    if (t1CurrentTime !== null && t2CurrentTime !== null) {
      if (t1CurrentTime < t2CurrentTime) {
        return { id: 1, time: t1CurrentTime };
      } else if (t2CurrentTime < t1CurrentTime) {
        return { id: 2, time: t2CurrentTime };
      } else {
        return { id: "either", time: t1CurrentTime }; // Both are equal
      }
    }
    return null;
  })();

  const timeSinceRecommendationUpdate = recommendationLastUpdated
    ? differenceInMinutes(new Date(), new Date(parseISO(recommendationLastUpdated)))
    : null;

  return (
    <div className="min-h-screen flex flex-col items-center px-4 pt-20">
      <PhoneNotch />
      
      {/* Settings icon moved to top-left */}
      <Link to="/settings" className="fixed top-4 left-4 z-50">
        <Button variant="ghost" size="icon" className="text-blue-800 hover:bg-blue-100 dark:text-blue-200 dark:hover:bg-blue-800">
          <SettingsIcon className="h-5 w-5" /> {/* Increased icon size slightly for better tap target */}
          <span className="sr-only">Settings</span>
        </Button>
      </Link>

      <div className="w-full max-w-5xl mb-8 p-4 bg-blue-50 border border-blue-200 rounded-lg shadow-md text-blue-800 dark:bg-blue-950 dark:border-blue-700 dark:text-blue-200 relative">
        {loadingRecommendation || isAutoRefreshing ? (
          <div className="flex items-center justify-center py-4">
            <Loader2 className="h-5 w-5 animate-spin mr-2" />
            <p>Loading recommendation...</p>
          </div>
        ) : recommendedTerminal ? (
          <>
            <p className="text-lg font-semibold mb-2">
              💡 We recommend using{" "}
              <span className="font-bold text-blue-900 dark:text-blue-100">
                {recommendedTerminal.id === "either"
                  ? "either Terminal's security"
                  : `Terminal ${recommendedTerminal.id}'s security`}
              </span>{" "}
              as it is currently the quickest (
              <span className="font-bold text-blue-900 dark:text-blue-100">
                {recommendedTerminal.time} minutes
              </span>
              ).
            </p>
            <p className="text-sm">
              You can easily proceed to your preferred terminal after clearing security, and T1 has the best shops 🤫!
            </p>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">
              Recommendation last updated{" "}
              {timeSinceRecommendationUpdate !== null ? `${timeSinceRecommendationUpdate} minutes ago` : "N/A"}.
            </p>
          </>
        ) : (
          <p className="text-lg font-semibold py-4">
            Could not load security time recommendations. Please try refreshing.
          </p>
        )}
        <Button
          variant="ghost"
          size="icon"
          onClick={refreshAllData} // Use refreshAllData for manual refresh
          disabled={loadingRecommendation || isAutoRefreshing}
          className="absolute top-2 right-2 text-blue-800 hover:bg-blue-100 dark:text-blue-200 dark:hover:bg-blue-800"
        >
          {loadingRecommendation || isAutoRefreshing ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <RefreshCw className="h-4 w-4" />
          )}
          <span className="sr-only">Refresh recommendation</span>
        </Button>
      </div>

      <div className="w-full max-w-5xl flex flex-col md:flex-row gap-8 justify-center mb-8">
        <TerminalSecurityCard terminalId={1} globalMaxTime={globalMaxSecurityTime} isAutoRefreshing={isAutoRefreshing} />
        <TerminalSecurityCard terminalId={2} globalMaxTime={globalMaxSecurityTime} isAutoRefreshing={isAutoRefreshing} />
      </div>
      <BottomNotch />
    </div>
  );
};

export default Index;
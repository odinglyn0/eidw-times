import TerminalSecurityCard from "@/components/TSecCard";
import SecurityOpeningHours from "@/components/SecOpenH";
import { useState, useEffect, useCallback, useRef } from "react";
import { apiClient } from "@/integrations/api/client";
import { Loader2, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/Btt";
import { differenceInMinutes, parseISO } from "date-fns";
import PhoneNotch from "@/components/N";
import BottomNotch from "@/components/BotN";
import SettingsPageLink from "@/components/Set";
import { getAutoPollEnabled, getAutoPollInterval, getShowRecommendation } from '@/lib/cookies';
import AnnouncementBanner from "@/components/AnnounB";
import LaserPulseBorder from "@/components/LPB";

interface RecommendationData {
  t1: number | null;
  t2: number | null;
  lastUpdated: string | null;
  recommended: { id: number | "either"; time: number } | null;
  timeDifferenceMessage: string | null;
  additionalTip: string;
  globalMaxSecurityTime: number;
  t1SecurityOpen: boolean;
  t2SecurityOpen: boolean;
}

const Index = () => {
  const [recData, setRecData] = useState<RecommendationData | null>(null);
  const [loadingRecommendation, setLoadingRecommendation] = useState(true);
  const [isAutoRefreshing, setIsAutoRefreshing] = useState(false);
  const autoRefreshIntervalId = useRef<number | null>(null);
  const [showRecommendation, setShowRecommendation] = useState(true);

  useEffect(() => {
    setShowRecommendation(getShowRecommendation());
  }, []);

  const fetchRecommendationData = useCallback(async () => {
    setLoadingRecommendation(true);
    try {
      const data = await apiClient.getRecommendation();
      setRecData(data);
    } catch (err) {
      console.error("Error fetching recommendation:", err);
      setRecData(null);
    } finally {
      setLoadingRecommendation(false);
    }
  }, []);

  const refreshAllData = useCallback(async () => {
    setIsAutoRefreshing(true);
    await fetchRecommendationData();
    setIsAutoRefreshing(false);
  }, [fetchRecommendationData]);

  useEffect(() => {
    refreshAllData();

    const setupAutoRefresh = () => {
      if (autoRefreshIntervalId.current) {
        clearInterval(autoRefreshIntervalId.current);
      }
      const enabled = getAutoPollEnabled();
      const interval = getAutoPollInterval();
      if (enabled && interval > 0) {
        autoRefreshIntervalId.current = setInterval(() => {
          refreshAllData();
        }, interval * 1000) as unknown as number;
      }
    };

    setupAutoRefresh();

    const handleStorageChange = () => { setupAutoRefresh(); };
    window.addEventListener('storage', handleStorageChange);

    return () => {
      if (autoRefreshIntervalId.current) clearInterval(autoRefreshIntervalId.current);
      window.removeEventListener('storage', handleStorageChange);
    };
  }, [refreshAllData]);

  const timeSinceRecommendationUpdate = recData?.lastUpdated
    ? differenceInMinutes(new Date(), new Date(parseISO(recData.lastUpdated)))
    : null;

  return (
    <div className="min-h-screen flex flex-col items-center px-4 pt-24 relative">
      <PhoneNotch />
      <SettingsPageLink />
      <AnnouncementBanner />

      {showRecommendation && (
      <LaserPulseBorder
        active={loadingRecommendation || isAutoRefreshing}
        config={{
          color: "#3B82F6",
          duration: 600,
          pulseWidth: 50,
          bulgeAmount: 3,
          bulgeSpread: 35,
          borderRadius: 8,
        }}
        className="w-full max-w-5xl mb-8"
      >
      <div className="w-full p-4 pr-12 bg-blue-50 border border-blue-200 rounded-lg shadow-md text-blue-800 dark:bg-blue-950 dark:border-blue-700 dark:text-blue-200 relative">
        {loadingRecommendation || isAutoRefreshing ? (
          <div className="flex items-center justify-center py-4">
            <Loader2 className="h-5 w-5 animate-spin mr-2" />
            <p>Loading recommendation...</p>
          </div>
        ) : recData?.recommended ? (
          <>
            <p className="text-lg font-semibold mb-2">
              We recommend using{" "}
              <span className="font-bold text-blue-900 dark:text-blue-100">
                {recData.recommended.id === "either"
                  ? "either Terminal"
                  : `Terminal ${recData.recommended.id}`}
              </span>{" "}
              as it is currently the quickest (
              <span className="font-bold text-blue-900 dark:text-blue-100">
                {recData.recommended.time} minutes
              </span>
              ).
            </p>
            {recData.timeDifferenceMessage && (
              <p className="text-base font-normal text-blue-700 dark:text-blue-300 mt-2">
                {recData.timeDifferenceMessage}
              </p>
            )}
            <p className="text-sm">
              You can easily proceed to your preferred terminal after clearing security, {recData.additionalTip}
            </p>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">
              Recommendation last updated{" "}
              {timeSinceRecommendationUpdate !== null ? `${timeSinceRecommendationUpdate} minutes ago` : "N/A"}.
            </p>
          </>
        ) : recData && !recData.t1SecurityOpen && !recData.t2SecurityOpen ? (
          <p className="text-lg font-semibold py-4">
            Security is currently closed at both terminals. Check back closer to opening time for a recommendation.
          </p>
        ) : recData && !recData.recommended && (!recData.t1SecurityOpen || !recData.t2SecurityOpen) ? (
          <p className="text-lg font-semibold py-4">
            {!recData.t1SecurityOpen
              ? "Terminal 1 security is closed for the evening. Terminal 2 is open."
              : "Terminal 2 security is closed for the evening. Terminal 1 is open."}
          </p>
        ) : (
          <p className="text-lg font-semibold py-4">
            Could not load security time recommendations. Please try refreshing.
          </p>
        )}
        <Button
          variant="ghost"
          size="icon"
          onClick={refreshAllData}
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
      </LaserPulseBorder>
      )}

      <div className="w-full max-w-5xl flex flex-col md:flex-row gap-8 justify-center mb-8 mt-16">
        <TerminalSecurityCard
          terminalId={1}
          globalMaxTime={recData?.globalMaxSecurityTime ?? null}
          isAutoRefreshing={isAutoRefreshing}
          t1CurrentTime={recData?.t1 ?? null}
          t2CurrentTime={recData?.t2 ?? null}
          isSecurityOpen={recData?.t1SecurityOpen ?? true}
          isOtherTerminalOpen={recData?.t2SecurityOpen ?? true}
        />
        <TerminalSecurityCard
          terminalId={2}
          globalMaxTime={recData?.globalMaxSecurityTime ?? null}
          isAutoRefreshing={isAutoRefreshing}
          t1CurrentTime={recData?.t1 ?? null}
          t2CurrentTime={recData?.t2 ?? null}
          isSecurityOpen={recData?.t2SecurityOpen ?? true}
          isOtherTerminalOpen={recData?.t1SecurityOpen ?? true}
        />
      </div>

      <SecurityOpeningHours />

      <nav className="w-full max-w-5xl text-center text-xs text-gray-400 dark:text-gray-600 mt-8 mb-4" aria-label="Additional resources">
        <a href="https://datagram.eidwtimes.xyz/api/seo-security-data" className="hover:underline">Dublin Airport Live Security Times</a>
        {" · "}
        <a href="/llms.txt" className="hover:underline">llms.txt</a>
      </nav>

      <BottomNotch />
    </div>
  );
};

export default Index;

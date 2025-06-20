import TerminalSecurityCard from "@/components/TerminalSecurityCard";
import DublinAirportLogo from "@/assets/Dublin_airport_logo.svg.png";
import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Loader2, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { differenceInMinutes, parseISO } from "date-fns";

const Index = () => {
  const [t1CurrentTime, setT1CurrentTime] = useState<number | null>(null);
  const [t2CurrentTime, setT2CurrentTime] = useState<number | null>(null);
  const [recommendationLastUpdated, setRecommendationLastUpdated] = useState<string | null>(null);
  const [loadingRecommendation, setLoadingRecommendation] = useState(true);

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

  useEffect(() => {
    fetchRecommendationData();
  }, [fetchRecommendationData]);

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
    <div className="min-h-screen flex flex-col items-center justify-center p-4">
      <div className="text-center mb-8">
        <img
          src={DublinAirportLogo}
          alt="Dublin Airport Logo"
          className="mx-auto h-16 w-auto"
        />
      </div>

      <div className="w-full max-w-5xl mb-8 p-4 bg-blue-50 border border-blue-200 rounded-lg shadow-md text-blue-800 dark:bg-blue-950 dark:border-blue-700 dark:text-blue-200 relative">
        {loadingRecommendation ? (
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
          onClick={fetchRecommendationData}
          disabled={loadingRecommendation}
          className="absolute top-2 right-2 text-blue-800 hover:bg-blue-100 dark:text-blue-200 dark:hover:bg-blue-800"
        >
          {loadingRecommendation ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <RefreshCw className="h-4 w-4" />
          )}
          <span className="sr-only">Refresh recommendation</span>
        </Button>
      </div>

      <div className="w-full max-w-5xl flex flex-col md:flex-row gap-8 justify-center">
        <TerminalSecurityCard terminalId={1} />
        <TerminalSecurityCard terminalId={2} />
      </div>
      <div className="mt-8 text-center text-gray-600 dark:text-gray-400 text-sm flex flex-col sm:flex-row items-center justify-center gap-1 sm:gap-4">
        <span>
          Made with ❤️ from{" "}
          <a
            href="https://odinglynn.com"
            target="_blank"
            rel="noopener noreferrer"
            className="text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-200 underline"
          >
            Odin Glynn Photography
          </a>
        </span>
        <span>
          🔥 Carrying on the legacy from{" "}
          <a
            href="https://www.reddit.com/r/ireland/comments/utoxj2/a_friend_of_mine_made_a_website_that_pulls_the/"
            target="_blank"
            rel="noopener noreferrer"
            className="text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-200 underline"
          >
            this project
          </a>
        </span>
      </div>
      <div className="mt-4 text-center text-gray-500 dark:text-gray-400 text-xs">
        <p>
          Disclaimer: This is a personal project and is in no way affiliated with the DAA or Dublin Airport.
        </p>
      </div>
    </div>
  );
};

export default Index;
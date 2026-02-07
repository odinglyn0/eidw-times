import React, { useState, useEffect, useRef } from 'react';
import { apiClient } from "@/integrations/api/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { CheckCircle, Loader2 } from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { cn } from '@/lib/utils';

interface FeatureRequest {
  id: string;
  name: string | null;
  details: string;
  created_at: string;
  acknowledged: boolean;
  done: boolean;
}

const SCROLL_INTERVAL_MS = 8000; // Scroll every 8 seconds
const DISPLAY_COUNT = 3; // Show 3 requests at a time

const AcknowledgedRequestsDisplay: React.FC = () => {
  const [requests, setRequests] = useState<FeatureRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [currentIndex, setCurrentIndex] = useState(0);
  const scrollIntervalRef = useRef<number | null>(null);

  const fetchAcknowledgedRequests = async () => {
    setLoading(true);
    setError(null);
    try {
      const fetchedRequests = await apiClient.getAcknowledgedFeatureRequests();
      setRequests(fetchedRequests);
      // Reset index if requests change or become fewer than current index
      if (fetchedRequests.length <= currentIndex) {
        setCurrentIndex(0);
      }
    } catch (err) {
      console.error("Error fetching acknowledged feature requests:", err);
      setError("Failed to load acknowledged requests.");
      setRequests([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAcknowledgedRequests();

    // Set up auto-refresh for the data itself
    const dataRefreshInterval = setInterval(fetchAcknowledgedRequests, 5 * 60 * 1000); // Refresh data every 5 minutes

    return () => {
      clearInterval(dataRefreshInterval);
      if (scrollIntervalRef.current) {
        clearInterval(scrollIntervalRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (requests.length > DISPLAY_COUNT) {
      // Clear any existing interval before setting a new one
      if (scrollIntervalRef.current) {
        clearInterval(scrollIntervalRef.current);
      }
      scrollIntervalRef.current = setInterval(() => {
        setCurrentIndex(prevIndex => (prevIndex + 1) % requests.length);
      }, SCROLL_INTERVAL_MS) as unknown as number; // Cast to number for clearInterval
    } else {
      // If not enough requests to scroll, clear interval
      if (scrollIntervalRef.current) {
        clearInterval(scrollIntervalRef.current);
        scrollIntervalRef.current = null;
      }
      setCurrentIndex(0); // Ensure index is reset if requests become fewer
    }

    return () => {
      if (scrollIntervalRef.current) {
        clearInterval(scrollIntervalRef.current);
      }
    };
  }, [requests.length, currentIndex]); // Re-run if requests length changes

  const displayedRequests = requests.slice(currentIndex, currentIndex + DISPLAY_COUNT);
  // If we slice past the end, wrap around to the beginning
  if (displayedRequests.length < DISPLAY_COUNT && requests.length > 0) {
    const remaining = DISPLAY_COUNT - displayedRequests.length;
    displayedRequests.push(...requests.slice(0, remaining));
  }

  return (
    <Card className="w-full border-2 border-gray-300 rounded-lg shadow-lg h-full flex flex-col">
      <CardHeader className="bg-gray-100 p-4 text-gray-800 text-center">
        <CardTitle className="text-2xl font-bold">Acknowledged Requests</CardTitle>
        <CardDescription>
          Features we're working on or have completed!
        </CardDescription>
      </CardHeader>
      <CardContent className="p-6 flex-grow flex flex-col justify-center">
        {loading ? (
          <div className="space-y-4">
            <Skeleton className="h-16 w-full" />
            <Skeleton className="h-16 w-full" />
            <Skeleton className="h-16 w-full" />
          </div>
        ) : error ? (
          <p className="text-center text-red-500">{error}</p>
        ) : requests.length === 0 ? (
          <p className="text-center text-muted-foreground">No acknowledged requests yet. Check back soon!</p>
        ) : (
          <div className="space-y-4">
            {displayedRequests.map((request, index) => (
              <div key={request.id} className="border-b pb-3 last:border-b-0 last:pb-0">
                <div className="flex items-center justify-between mb-1">
                  <p className="font-semibold text-gray-800 dark:text-gray-200">
                    {request.name || "Anonymous"}
                  </p>
                  <span className="text-xs text-gray-500 dark:text-gray-400">
                    {format(parseISO(request.created_at), 'MMM dd, yyyy')}
                  </span>
                </div>
                <div className="flex items-start">
                  <p className="text-sm text-gray-700 dark:text-gray-300 flex-grow">
                    {request.details}
                  </p>
                  {request.done && (
                    <CheckCircle className="h-5 w-5 text-green-500 ml-2 flex-shrink-0" />
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default AcknowledgedRequestsDisplay;
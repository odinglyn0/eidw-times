import React, { useEffect, useState } from 'react';
import { apiClient } from "@/integrations/api/client";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Info } from 'lucide-react';
import { Skeleton } from "@/components/ui/skeleton";

interface Announcement {
  id: string;
  message: string;
  start_date: string;
  end_date: string;
}

const AnnouncementBanner: React.FC = () => {
  const [announcement, setAnnouncement] = useState<Announcement | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchAnnouncements = async () => {
      setLoading(true);
      setError(null);
      try {
        const announcements = await apiClient.getActiveAnnouncements();
        if (announcements && announcements.length > 0) {
          setAnnouncement(announcements[0]);
        } else {
          setAnnouncement(null);
        }
      } catch (err) {
        console.error("Error fetching announcements:", err);
        setError("Failed to load announcements.");
        setAnnouncement(null);
      } finally {
        setLoading(false);
      }
    };

    fetchAnnouncements();

    // Optionally, refresh announcements periodically
    const interval = setInterval(fetchAnnouncements, 5 * 60 * 1000); // Refresh every 5 minutes
    return () => clearInterval(interval);
  }, []);

  if (loading) {
    return (
      <div className="w-full max-w-5xl mb-8 px-4">
        <Skeleton className="h-16 w-full" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="w-full max-w-5xl mb-8 px-4">
        <Alert variant="destructive">
          <Info className="h-4 w-4" />
          <AlertTitle>Error</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      </div>
    );
  }

  if (!announcement) {
    return null; // No active announcements to display
  }

  return (
    <div className="w-full max-w-5xl mb-8 px-4">
      <Alert className="bg-blue-100 border-blue-300 text-blue-800 dark:bg-blue-900 dark:border-blue-700 dark:text-blue-200">
        <Info className="h-4 w-4" />
        <AlertTitle>Announcement</AlertTitle>
        <AlertDescription>{announcement.message}</AlertDescription>
      </Alert>
    </div>
  );
};

export default AnnouncementBanner;
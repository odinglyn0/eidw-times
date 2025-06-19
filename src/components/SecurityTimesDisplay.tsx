import React, { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { supabase } from "@/integrations/supabase/client";
import { RefreshCcw } from "lucide-react";
import { showError } from "@/utils/toast";

interface SecurityTimes {
  t1: number | null;
  t2: number | null;
}

const SecurityTimesDisplay: React.FC = () => {
  const [times, setTimes] = useState<SecurityTimes | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchSecurityTimes = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("security_times_current")
        .select("t1, t2")
        .eq("id", 1) // Assuming 'id' 1 holds the current times
        .single();

      if (error) {
        throw error;
      }
      setTimes(data);
    } catch (error) {
      console.error("Error fetching security times:", error);
      showError("Failed to load current security times.");
      setTimes(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSecurityTimes();
  }, []);

  return (
    <Card className="w-full max-w-md mx-auto">
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-2xl font-bold">Current Security Times</CardTitle>
        <Button variant="outline" size="icon" onClick={fetchSecurityTimes} disabled={loading}>
          <RefreshCcw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
        </Button>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="space-y-4">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-4 text-center">
            <div>
              <p className="text-lg font-medium text-muted-foreground">Terminal 1</p>
              <p className="text-4xl font-extrabold text-primary">
                {times?.t1 !== null ? `${times.t1} min` : "N/A"}
              </p>
            </div>
            <div>
              <p className="text-lg font-medium text-muted-foreground">Terminal 2</p>
              <p className="text-4xl font-extrabold text-primary">
                {times?.t2 !== null ? `${times.t2} min` : "N/A"}
              </p>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default SecurityTimesDisplay;
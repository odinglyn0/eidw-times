import React, { useEffect, useState, useCallback, useRef } from "react";
import { apiClient } from "@/integrations/api/client";
import { cn } from "@/lib/utils";
import { Shield, Zap, Globe, Clock, ChevronDown, ChevronUp, Loader2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

type FacilityStatus = "open" | "closed" | "opening-soon" | "closing-soon";

interface Facility {
  name: string;
  terminal: 1 | 2;
  openTime: string;
  closeTime: string;
  closeDisplayText: string;
  iconType: string;
  status: FacilityStatus;
  opensIn?: string | null;
  closesIn?: string | null;
}

const statusConfig: Record<FacilityStatus, {
  dotColor: string;
  bgColor: string;
  textColor: string;
  borderColor: string;
  label: string;
  pingColor: string;
}> = {
  open: {
    dotColor: "bg-emerald-400",
    bgColor: "bg-emerald-900/30 dark:bg-emerald-900/40",
    textColor: "text-emerald-400 dark:text-emerald-300",
    borderColor: "border-emerald-700/40 dark:border-emerald-600/40",
    label: "Open",
    pingColor: "bg-emerald-400",
  },
  closed: {
    dotColor: "bg-rose-400",
    bgColor: "bg-rose-900/30 dark:bg-rose-900/40",
    textColor: "text-rose-400 dark:text-rose-300",
    borderColor: "border-rose-700/40 dark:border-rose-600/40",
    label: "Closed",
    pingColor: "bg-rose-400",
  },
  "opening-soon": {
    dotColor: "bg-amber-400",
    bgColor: "bg-amber-900/30 dark:bg-amber-900/40",
    textColor: "text-amber-400 dark:text-amber-300",
    borderColor: "border-amber-700/40 dark:border-amber-600/40",
    label: "Opening Soon",
    pingColor: "bg-amber-400",
  },
  "closing-soon": {
    dotColor: "bg-orange-400",
    bgColor: "bg-orange-900/30 dark:bg-orange-900/40",
    textColor: "text-orange-400 dark:text-orange-300",
    borderColor: "border-orange-700/40 dark:border-orange-600/40",
    label: "Closing Soon",
    pingColor: "bg-orange-400",
  },
};

const StatusDot: React.FC<{ status: FacilityStatus }> = ({ status }) => {
  const config = statusConfig[status];
  const shouldPing = status === "open" || status === "opening-soon" || status === "closing-soon";

  return (
    <span className="relative flex h-3 w-3">
      {shouldPing && (
        <span
          className={cn(
            "absolute inline-flex h-full w-full rounded-full opacity-75",
            config.pingColor,
            status === "open" ? "animate-ping-slow" : "animate-pulse-dot"
          )}
        />
      )}
      <span className={cn("relative inline-flex rounded-full h-3 w-3", config.dotColor)} />
    </span>
  );
};

function getIcon(type: string) {
  switch (type) {
    case "shield": return <Shield className="h-4 w-4" />;
    case "zap": return <Zap className="h-4 w-4" />;
    case "globe": return <Globe className="h-4 w-4" />;
    default: return <Shield className="h-4 w-4" />;
  }
}

const FacilityRow: React.FC<{ facility: Facility }> = ({ facility }) => {
  const config = statusConfig[facility.status];

  return (
    <div
      className={cn(
        "flex items-center gap-3 px-3 py-2.5 rounded-lg border transition-all duration-500",
        config.bgColor,
        config.borderColor
      )}
    >
      <div className="flex-shrink-0 text-gray-300">
        {getIcon(facility.iconType)}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-gray-100 truncate">
            {facility.name}
          </span>
        </div>
        <div className="flex items-center gap-1 mt-0.5">
          <Clock className="h-3 w-3 text-gray-400 flex-shrink-0" />
          <span className="text-xs text-gray-400">
            {facility.openTime} – {facility.closeDisplayText}
          </span>
        </div>
      </div>
      <div className="flex items-center gap-2 flex-shrink-0">
        <div className="text-right">
          <div className={cn("flex items-center gap-1.5", config.textColor)}>
            <StatusDot status={facility.status} />
            <span className="text-xs font-semibold">{config.label}</span>
          </div>
          {facility.status === "opening-soon" && facility.opensIn && (
            <span className="text-[10px] text-gray-400">
              Opens in {facility.opensIn}
            </span>
          )}
          {facility.status === "closing-soon" && facility.closesIn && (
            <span className="text-[10px] text-gray-400">
              Closes in {facility.closesIn}
            </span>
          )}
          {facility.status === "closed" && facility.opensIn && (
            <span className="text-[10px] text-gray-400">
              Opens in {facility.opensIn}
            </span>
          )}
        </div>
      </div>
    </div>
  );
};

const SecurityOpeningHours: React.FC = () => {
  const [facilities, setFacilities] = useState<Facility[]>([]);
  const [irishTime, setIrishTime] = useState<Date | null>(null);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(true);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchFacilityHours = useCallback(async () => {
    try {
      const data = await apiClient.getFacilityHours();
      setFacilities(data.facilities);
      setIrishTime(new Date(data.irishTime));
    } catch (err) {
      console.error("Error fetching facility hours:", err);
      setFacilities([]);
      setIrishTime(new Date());
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchFacilityHours();
    intervalRef.current = setInterval(fetchFacilityHours, 60_000);

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [fetchFacilityHours]);

  if (loading || !irishTime) {
    return (
      <div className="w-full max-w-5xl mb-8">
        <Card className="w-full border-2 rounded-lg shadow-lg border-border">
          <CardHeader className="p-4 bg-muted text-center">
            <div className="flex items-center justify-center">
              <Loader2 className="h-4 w-4 animate-spin mr-2 text-muted-foreground" />
              <span className="text-sm text-muted-foreground">Loading facility hours...</span>
            </div>
          </CardHeader>
        </Card>
      </div>
    );
  }

  const t1Facilities = facilities.filter((f) => f.terminal === 1);
  const t2Facilities = facilities.filter((f) => f.terminal === 2);

  const allOpen = facilities.every((f) => f.status === "open");
  const allClosed = facilities.every((f) => f.status === "closed");
  const openCount = facilities.filter((f) => f.status === "open").length;
  const summaryText = allOpen
    ? "All facilities open"
    : allClosed
    ? "All facilities closed"
    : `${openCount}/${facilities.length} open`;

  const summaryStatus: FacilityStatus = allOpen ? "open" : allClosed ? "closed" : "opening-soon";

  const openRatio = facilities.length > 0 ? openCount / facilities.length : 0;
  const averagedBorderColor = openRatio >= 0.6
    ? "border-emerald-600/50"
    : openRatio >= 0.3
    ? "border-amber-600/50"
    : "border-rose-600/50";
  const averagedHeaderBg = openRatio >= 0.6
    ? "bg-emerald-900/60"
    : openRatio >= 0.3
    ? "bg-amber-900/60"
    : "bg-rose-900/60";

  return (
    <div className="w-full max-w-5xl mb-8">
      <Card className={cn("w-full border-2 rounded-lg shadow-lg relative", averagedBorderColor)}>
        <CardHeader
          className={cn(
            "p-4 text-white text-center relative cursor-pointer",
            averagedHeaderBg
          )}
          onClick={() => setExpanded(!expanded)}
        >
          <div className="flex items-center justify-between w-full">
            <div className="flex items-center gap-3">
              <StatusDot status={summaryStatus} />
              <CardTitle className="text-lg font-semibold text-gray-100">Facility Hours</CardTitle>
              <span className="text-xs text-gray-300">
                {summaryText}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-[10px] text-gray-300">
                Irish Time: {irishTime.toLocaleTimeString("en-IE", { hour: "2-digit", minute: "2-digit", hour12: false })}
              </span>
              {expanded ? (
                <ChevronUp className="h-4 w-4 text-gray-300" />
              ) : (
                <ChevronDown className="h-4 w-4 text-gray-300" />
              )}
            </div>
          </div>
        </CardHeader>

        <div
          className={cn(
            "overflow-hidden transition-all duration-500 ease-in-out",
            expanded ? "max-h-[600px] opacity-100" : "max-h-0 opacity-0"
          )}
        >
          <CardContent className="p-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider px-1">
                  Terminal 1
                </h4>
                {t1Facilities.map((f, i) => (
                  <FacilityRow key={`t1-${i}`} facility={f} />
                ))}
              </div>

              <div className="space-y-2">
                <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider px-1">
                  Terminal 2
                </h4>
                {t2Facilities.map((f, i) => (
                  <FacilityRow key={`t2-${i}`} facility={f} />
                ))}
              </div>
            </div>
          </CardContent>
        </div>
      </Card>
    </div>
  );
};

export default SecurityOpeningHours;
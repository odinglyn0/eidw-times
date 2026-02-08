import React, { useEffect, useState, useCallback, useRef } from "react";
import { apiClient } from "@/integrations/api/client";
import { cn } from "@/lib/utils";
import { Shield, Zap, Globe, Clock, ChevronDown, ChevronUp, Loader2 } from "lucide-react";

type FacilityStatus = "open" | "closed" | "opening-soon" | "closing-soon";

interface Facility {
  name: string;
  icon: React.ReactNode;
  terminal: 1 | 2;
  openTime: string;
  closeTime: string;
  closeDisplayText: string;
  status: FacilityStatus;
  opensIn?: string;
  closesIn?: string;
}

const OPENING_SOON_MINUTES = 30;
const CLOSING_SOON_MINUTES = 30;

function parseHHMM(hhmm: string): { hours: number; minutes: number } {
  const [h, m] = hhmm.split(":").map(Number);
  return { hours: h, minutes: m };
}

function getMinutesSinceMidnight(date: Date): number {
  return date.getHours() * 60 + date.getMinutes();
}

function formatDuration(totalMinutes: number): string {
  if (totalMinutes < 1) return "less than a minute";
  const h = Math.floor(totalMinutes / 60);
  const m = Math.round(totalMinutes % 60);
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}

function computeStatus(
  now: Date,
  openTime: string,
  closeTime: string,
): { status: FacilityStatus; opensIn?: string; closesIn?: string } {
  const nowMins = getMinutesSinceMidnight(now);
  const open = parseHHMM(openTime);
  const openMins = open.hours * 60 + open.minutes;
  const close = parseHHMM(closeTime);
  const closeMins = close.hours * 60 + close.minutes;

  if (nowMins < openMins) {
    const minsUntilOpen = openMins - nowMins;
    if (minsUntilOpen <= OPENING_SOON_MINUTES) {
      return { status: "opening-soon", opensIn: formatDuration(minsUntilOpen) };
    }
    return { status: "closed", opensIn: formatDuration(minsUntilOpen) };
  }

  if (nowMins >= openMins && nowMins < closeMins) {
    const minsUntilClose = closeMins - nowMins;
    if (minsUntilClose <= CLOSING_SOON_MINUTES) {
      return { status: "closing-soon", closesIn: formatDuration(minsUntilClose) };
    }
    return { status: "open" };
  }

  return { status: "closed" };
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
    dotColor: "bg-emerald-500",
    bgColor: "bg-emerald-500/60 dark:bg-emerald-500/70",
    textColor: "text-emerald-700 dark:text-emerald-400",
    borderColor: "border-emerald-500/70 dark:border-emerald-500/80",
    label: "Open",
    pingColor: "bg-emerald-400",
  },
  closed: {
    dotColor: "bg-red-500",
    bgColor: "bg-red-500/60 dark:bg-red-500/70",
    textColor: "text-red-700 dark:text-red-400",
    borderColor: "border-red-500/70 dark:border-red-500/80",
    label: "Closed",
    pingColor: "bg-red-400",
  },
  "opening-soon": {
    dotColor: "bg-amber-500",
    bgColor: "bg-amber-500/60 dark:bg-amber-500/70",
    textColor: "text-amber-700 dark:text-amber-400",
    borderColor: "border-amber-500/70 dark:border-amber-500/80",
    label: "Opening Soon",
    pingColor: "bg-amber-400",
  },
  "closing-soon": {
    dotColor: "bg-orange-500",
    bgColor: "bg-orange-500/60 dark:bg-orange-500/70",
    textColor: "text-orange-700 dark:text-orange-400",
    borderColor: "border-orange-500/70 dark:border-orange-500/80",
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
      <div className="flex-shrink-0 text-muted-foreground">
        {facility.icon}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-foreground truncate">
            {facility.name}
          </span>
        </div>
        <div className="flex items-center gap-1 mt-0.5">
          <Clock className="h-3 w-3 text-muted-foreground flex-shrink-0" />
          <span className="text-xs text-muted-foreground">
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
            <span className="text-[10px] text-muted-foreground">
              Opens in {facility.opensIn}
            </span>
          )}
          {facility.status === "closing-soon" && facility.closesIn && (
            <span className="text-[10px] text-muted-foreground">
              Closes in {facility.closesIn}
            </span>
          )}
          {facility.status === "closed" && facility.opensIn && (
            <span className="text-[10px] text-muted-foreground">
              Opens in {facility.opensIn}
            </span>
          )}
        </div>
      </div>
    </div>
  );
};

interface FacilityDefinition {
  name: string;
  terminal: 1 | 2;
  openTime: string;
  closeTime: string | "last-flight";
  iconType: string;
}

const FACILITY_DEFINITIONS: FacilityDefinition[] = [
  { name: "Security", terminal: 1, openTime: "03:00", closeTime: "last-flight", iconType: "shield" },
  { name: "Fast Track Security", terminal: 1, openTime: "04:00", closeTime: "21:00", iconType: "zap" },
  { name: "Security", terminal: 2, openTime: "03:30", closeTime: "last-flight", iconType: "shield" },
  { name: "Fast Track Security", terminal: 2, openTime: "04:00", closeTime: "18:00", iconType: "zap" },
  { name: "US Preclearance", terminal: 2, openTime: "07:00", closeTime: "16:30", iconType: "globe" },
];

function getIcon(type: string) {
  switch (type) {
    case "shield": return <Shield className="h-4 w-4" />;
    case "zap": return <Zap className="h-4 w-4" />;
    case "globe": return <Globe className="h-4 w-4" />;
    default: return <Shield className="h-4 w-4" />;
  }
}

const SecurityOpeningHours: React.FC = () => {
  const [irishTime, setIrishTime] = useState<Date | null>(null);
  const [lastDepartures, setLastDepartures] = useState<Record<string, string> | null>(null);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(true);
  const offsetRef = useRef<number | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const syncTime = useCallback(async () => {
    try {
      const before = Date.now();
      const data = await apiClient.getIrishTime();
      const after = Date.now();
      const latency = (after - before) / 2;
      const serverTime = new Date(data.time).getTime() + latency;
      offsetRef.current = serverTime - Date.now();
      setIrishTime(new Date(Date.now() + offsetRef.current));
    } catch {
      setIrishTime(new Date());
    }
  }, []);

  const fetchLastDepartures = useCallback(async () => {
    try {
      const data = await apiClient.getLastDepartures();
      setLastDepartures(data);
    } catch {
      setLastDepartures({});
    }
  }, []);

  useEffect(() => {
    Promise.all([syncTime(), fetchLastDepartures()]).then(() => setLoading(false));

    const syncInterval = setInterval(syncTime, 5 * 60 * 1000);
    const depInterval = setInterval(fetchLastDepartures, 15 * 60 * 1000);

    intervalRef.current = setInterval(() => {
      if (offsetRef.current !== null) {
        setIrishTime(new Date(Date.now() + offsetRef.current));
      }
    }, 30_000);

    return () => {
      clearInterval(syncInterval);
      clearInterval(depInterval);
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [syncTime, fetchLastDepartures]);

  if (loading || !irishTime || lastDepartures === null) {
    return (
      <div className="w-full max-w-5xl mb-6">
        <div className="w-full flex items-center justify-center px-4 py-3 rounded-lg border border-border bg-card">
          <Loader2 className="h-4 w-4 animate-spin mr-2 text-muted-foreground" />
          <span className="text-sm text-muted-foreground">Loading facility hours...</span>
        </div>
      </div>
    );
  }

  function resolveCloseTime(def: FacilityDefinition): { resolvedClose: string; displayClose: string } {
    if (def.closeTime !== "last-flight") {
      return { resolvedClose: def.closeTime, displayClose: def.closeTime };
    }
    const terminalKey = `T${def.terminal}`;
    const lastDepIso = lastDepartures![terminalKey];
    if (lastDepIso) {
      const lastDep = new Date(lastDepIso);
      const hh = String(lastDep.getHours()).padStart(2, "0");
      const mm = String(lastDep.getMinutes()).padStart(2, "0");
      return { resolvedClose: `${hh}:${mm}`, displayClose: `${hh}:${mm} (last flight)` };
    }
    return { resolvedClose: "23:59", displayClose: "No flights found" };
  }

  const facilities: Facility[] = FACILITY_DEFINITIONS.map((def) => {
    const { resolvedClose, displayClose } = resolveCloseTime(def);
    const { status, opensIn, closesIn } = computeStatus(irishTime, def.openTime, resolvedClose);
    return {
      name: def.name,
      icon: getIcon(def.iconType),
      terminal: def.terminal,
      openTime: def.openTime,
      closeTime: def.closeTime,
      closeDisplayText: displayClose,
      status,
      opensIn,
      closesIn,
    };
  });

  const t1Facilities = facilities.filter((f) => f.terminal === 1);
  const t2Facilities = facilities.filter((f) => f.terminal === 2);

  const allOpen = facilities.every((f) => f.status === "open");
  const allClosed = facilities.every((f) => f.status === "closed");
  const summaryText = allOpen
    ? "All facilities open"
    : allClosed
    ? "All facilities closed"
    : `${facilities.filter((f) => f.status === "open").length}/${facilities.length} open`;

  const summaryStatus: FacilityStatus = allOpen ? "open" : allClosed ? "closed" : "opening-soon";

  return (
    <div className="w-full max-w-5xl mb-6">
      <button
        onClick={() => setExpanded(!expanded)}
        className={cn(
          "w-full flex items-center justify-between px-4 py-3 rounded-lg border transition-all duration-300",
          "bg-card hover:bg-accent/50",
          "border-border"
        )}
      >
        <div className="flex items-center gap-3">
          <StatusDot status={summaryStatus} />
          <span className="text-sm font-semibold text-foreground">Facility Hours</span>
          <span className={cn("text-xs", statusConfig[summaryStatus].textColor)}>
            {summaryText}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[10px] text-muted-foreground">
            Irish Time: {irishTime.toLocaleTimeString("en-IE", { hour: "2-digit", minute: "2-digit", hour12: false })}
          </span>
          {expanded ? (
            <ChevronUp className="h-4 w-4 text-muted-foreground" />
          ) : (
            <ChevronDown className="h-4 w-4 text-muted-foreground" />
          )}
        </div>
      </button>

      <div
        className={cn(
          "overflow-hidden transition-all duration-500 ease-in-out",
          expanded ? "max-h-[600px] opacity-100 mt-3" : "max-h-0 opacity-0 mt-0"
        )}
      >
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
      </div>
    </div>
  );
};

export default SecurityOpeningHours;

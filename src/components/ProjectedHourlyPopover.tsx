import React, { useState, useEffect } from 'react';
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { TrendingUp, Clock, BarChart3, ArrowUp } from 'lucide-react';
import { apiClient } from '@/integrations/api/client';

interface ProjectedHourlyPopoverProps {
  terminalId: 1 | 2;
  currentTime: number | null;
}

const ProjectedHourlyPopover: React.FC<ProjectedHourlyPopoverProps> = ({
  terminalId,
  currentTime,
}) => {
  const [open, setOpen] = useState(false);
  const [stats, setStats] = useState<{
    maxTime: number;
    avgTime: number;
    peakMinute: number;
    dataPoints: number;
  } | null>(null);

  useEffect(() => {
    if (currentTime === null) { setStats(null); return; }
    let cancelled = false;

    apiClient.getProjectedHourlyStats(terminalId)
      .then(data => {
        if (!cancelled) setStats(data.stats || null);
      })
      .catch(() => { if (!cancelled) setStats(null); });

    return () => { cancelled = true; };
  }, [terminalId, currentTime]);

  if (!stats || currentTime === null) return null;

  const currentHour = new Date().getHours();
  const formatHour = (h: number) => `${h % 12 || 12} ${h >= 12 ? 'PM' : 'AM'}`;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          className="text-xs text-muted-foreground hover:text-foreground transition-colors underline underline-offset-2 decoration-dotted cursor-pointer"
          onClick={() => setOpen(!open)}
        >
          <TrendingUp className="inline h-3 w-3 mr-1" />
          projected hourly
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-56 p-0 overflow-hidden" align="center">
        <div className="bg-gradient-to-b from-emerald-500/10 to-transparent dark:from-emerald-500/5 px-4 pt-3 pb-2">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
            Projection for {formatHour(currentHour)}
          </p>
        </div>
        <div className="px-4 pb-4 pt-2 space-y-3">
          <div className="flex items-center gap-3">
            <div className="flex items-center justify-center w-8 h-8 rounded-full bg-red-100 dark:bg-red-900/30">
              <BarChart3 className="h-4 w-4 text-red-600 dark:text-red-400" />
            </div>
            <div>
              <p className="text-lg font-bold leading-tight">{stats.maxTime}m</p>
              <p className="text-xs text-muted-foreground">projected peak</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex items-center justify-center w-8 h-8 rounded-full bg-blue-100 dark:bg-blue-900/30">
              <Clock className="h-4 w-4 text-blue-600 dark:text-blue-400" />
            </div>
            <div>
              <p className="text-lg font-bold leading-tight">{stats.avgTime}m</p>
              <p className="text-xs text-muted-foreground">avg for the hour</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex items-center justify-center w-8 h-8 rounded-full bg-amber-100 dark:bg-amber-900/30">
              <ArrowUp className="h-4 w-4 text-amber-600 dark:text-amber-400" />
            </div>
            <div>
              <p className="text-lg font-bold leading-tight">:{String(stats.peakMinute).padStart(2, '0')}</p>
              <p className="text-xs text-muted-foreground">biggest expected jump</p>
            </div>
          </div>
          <p className="text-[10px] text-muted-foreground text-center pt-1 italic border-t border-border">
            Based on ~{stats.dataPoints} data points
          </p>
        </div>
      </PopoverContent>
    </Popover>
  );
};

export default ProjectedHourlyPopover;

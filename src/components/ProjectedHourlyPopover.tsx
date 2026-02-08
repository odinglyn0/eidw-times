import React, { useMemo, useState } from 'react';
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { TrendingUp, Clock, BarChart3, ArrowUp } from 'lucide-react';
import { getHourlyProjectionStats } from '@/utils/monteCarlo';
import { parseISO, getMinutes, getHours } from 'date-fns';

interface GranularSecurityData {
  timestamp: string;
  time: number | null;
}

interface ProjectedHourlyPopoverProps {
  granularDataForCurrentHour: GranularSecurityData[];
  currentTime: number | null;
}

const ProjectedHourlyPopover: React.FC<ProjectedHourlyPopoverProps> = ({
  granularDataForCurrentHour,
  currentTime,
}) => {
  const [open, setOpen] = useState(false);

  const stats = useMemo(() => {
    const validData = granularDataForCurrentHour
      .filter(d => d.time !== null)
      .sort((a, b) => parseISO(a.timestamp).getTime() - parseISO(b.timestamp).getTime());

    if (validData.length === 0 || currentTime === null) return null;

    const observedValues = validData.map(d => d.time!);
    const lastEntry = validData[validData.length - 1];
    const lastMinute = getMinutes(parseISO(lastEntry.timestamp));
    const lastValue = lastEntry.time!;

    return getHourlyProjectionStats(observedValues, lastValue, lastMinute);
  }, [granularDataForCurrentHour, currentTime]);

  if (!stats || currentTime === null) return null;

  const currentHour = new Date().getHours();
  const formatHour = (h: number) => {
    const ampm = h >= 12 ? 'PM' : 'AM';
    const h12 = h % 12 || 12;
    return `${h12} ${ampm}`;
  };

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
            Based on {granularDataForCurrentHour.filter(d => d.time !== null).length} data points · Monte Carlo sim
          </p>
        </div>
      </PopoverContent>
    </Popover>
  );
};

export default ProjectedHourlyPopover;

import React, { useMemo, useEffect, useState } from "react";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from "recharts";
import { format, parseISO, startOfDay, addDays } from "date-fns";
import { apiClient } from "@/integrations/api/client";

interface SecurityTimeGraphProps {
  terminalId: 1 | 2;
}

interface RawHourlyEntry {
  hour: number;
  t1: number | null;
  t2: number | null;
  timestamp: string | null;
}

interface RawDayEntry {
  date: string;
  hourlyData: RawHourlyEntry[];
}

interface ProjectedHour {
  hourLabel: string;
  hourOffset: number;
  timestamp: string;
  avgMedian: number | null;
}

function pickInterval(peak: number): number {
  const candidates = [1, 2, 5, 10, 15, 20, 25, 30, 50];
  for (const c of candidates) {
    if (Math.ceil(peak / c) <= 6) return c;
  }
  return 50;
}

const SecurityTimeGraph: React.FC<SecurityTimeGraphProps> = ({
  terminalId,
}) => {
  const [rawData, setRawData] = useState<RawDayEntry[]>([]);
  const [forecast, setForecast] = useState<ProjectedHour[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [secData, projData] = await Promise.all([
          apiClient.getSecurityData(),
          apiClient.getProjected6h(terminalId).catch(() => ({ hours: [] })),
        ]);
        if (!cancelled) {
          setRawData(secData);
          setForecast(projData.hours || []);
        }
      } catch {
        if (!cancelled) {
          setRawData([]);
          setForecast([]);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [terminalId]);

  const { chartData, dayTicks, dayLabels, yMax, yTicks } = useMemo(() => {
    const points: { ts: number; value: number | null; forecast: number | null }[] = [];

    let globalPeak = 0;
    rawData.forEach((day) => {
      day.hourlyData.forEach((h) => {
        const val = terminalId === 1 ? h.t1 : h.t2;
        const ts = h.timestamp
          ? parseISO(h.timestamp).getTime()
          : new Date(`${day.date}T${String(h.hour).padStart(2, "0")}:00:00`).getTime();
        points.push({ ts, value: val, forecast: null });

        if (h.t1 !== null && h.t1 > globalPeak) globalPeak = h.t1;
        if (h.t2 !== null && h.t2 > globalPeak) globalPeak = h.t2;
      });
    });

    forecast.forEach((p) => {
      if (!p.timestamp) return;
      const ts = parseISO(p.timestamp).getTime();
      points.push({ ts, value: null, forecast: p.avgMedian });
      if (p.avgMedian !== null && p.avgMedian > globalPeak) globalPeak = p.avgMedian;
    });

    points.sort((a, b) => a.ts - b.ts);

    const interval = pickInterval(globalPeak);
    const computedYMax = Math.ceil(globalPeak / interval) * interval || interval;

    const ticks: number[] = [];
    const labels: Record<number, string> = {};

    if (points.length > 0) {
      const minTs = points[0].ts;
      const maxTs = points[points.length - 1].ts;
      let day = startOfDay(new Date(minTs));
      while (day.getTime() <= maxTs + 86400000) {
        const t = day.getTime();
        if (t >= minTs - 43200000 && t <= maxTs + 43200000) {
          ticks.push(t);
          labels[t] = format(day, "EEE").toUpperCase();
        }
        day = addDays(day, 1);
      }
    }

    const lastActualTs = points
      .filter((p) => p.value !== null)
      .reduce((max, p) => (p.ts > max ? p.ts : max), 0);
    const lastActualVal = points.find(
      (p) => p.ts === lastActualTs && p.value !== null
    )?.value ?? null;

    const merged = points.map((p) => ({
      ts: p.ts,
      value: p.value,
      forecast: p.ts === lastActualTs ? lastActualVal : p.forecast,
    }));

    const yTickArr = Array.from(
      { length: Math.floor(computedYMax / interval) + 1 },
      (_, i) => i * interval
    );

    return {
      chartData: merged,
      dayTicks: ticks,
      dayLabels: labels,
      yMax: computedYMax,
      yTicks: yTickArr,
    };
  }, [rawData, forecast, terminalId]);

  if (loading) {
    return <div className="w-full h-[155px] animate-pulse bg-gray-200 dark:bg-gray-700 rounded" />;
  }

  if (chartData.length === 0) {
    return <p className="text-center text-muted-foreground text-sm">No data available.</p>;
  }

  return (
    <div className="w-full">
      <ResponsiveContainer width="100%" height={155}>
        <LineChart data={chartData} margin={{ top: 4, right: 12, left: -4, bottom: 2 }}>
          <defs>
            <linearGradient id={`lineGrad-${terminalId}`} x1="0" y1="1" x2="0" y2="0">
              <stop offset="0%" stopColor="#2E7D32" />
              <stop offset="20%" stopColor="#4CAF50" />
              <stop offset="40%" stopColor="#8BC34A" />
              <stop offset="55%" stopColor="#CDDC39" />
              <stop offset="70%" stopColor="#FFC107" />
              <stop offset="85%" stopColor="#FF9800" />
              <stop offset="100%" stopColor="#E64A19" />
            </linearGradient>
            <linearGradient id={`fcGrad-${terminalId}`} x1="0" y1="1" x2="0" y2="0">
              <stop offset="0%" stopColor="#2E7D32" stopOpacity={0.5} />
              <stop offset="40%" stopColor="#8BC34A" stopOpacity={0.5} />
              <stop offset="70%" stopColor="#FFC107" stopOpacity={0.5} />
              <stop offset="100%" stopColor="#E64A19" stopOpacity={0.5} />
            </linearGradient>
          </defs>
          <CartesianGrid
            stroke="none"
            horizontal={false}
            vertical={false}
          />
          <XAxis
            dataKey="ts"
            type="number"
            domain={["dataMin - 3600000", "dataMax + 3600000"]}
            ticks={dayTicks}
            tickFormatter={(v: number) => dayLabels[v] || ""}
            axisLine={false}
            tickLine={false}
            fontSize={10}
            tick={{ fill: "#6B7280", fontWeight: 700 }}
            interval={0}
          />
          <YAxis
            tickFormatter={(v: number) => `${v}m`}
            axisLine={false}
            tickLine={false}
            fontSize={10}
            tick={{ fill: "#6B7280", fontWeight: 700 }}
            domain={[0, yMax]}
            ticks={yTicks}
            width={35}
          />
          <Tooltip
            labelFormatter={(v: number) => format(new Date(v), "EEE h:mm a")}
            formatter={(value: number, name: string) => [
              `${value}m`,
              name === "forecast" ? "Forecast" : "Wait",
            ]}
            contentStyle={{
              backgroundColor: "rgba(0,0,0,0.85)",
              border: "none",
              borderRadius: "8px",
              color: "#fff",
              fontSize: "12px",
              padding: "6px 10px",
            }}
            cursor={{ stroke: "rgba(156,163,175,0.3)", strokeWidth: 1 }}
          />
          <Line
            type="natural"
            dataKey="value"
            stroke={`url(#lineGrad-${terminalId})`}
            strokeWidth={2}
            dot={false}
            activeDot={false}
            connectNulls={true}
            isAnimationActive={true}
          />
          <Line
            type="natural"
            dataKey="forecast"
            stroke={`url(#fcGrad-${terminalId})`}
            strokeWidth={2}
            strokeDasharray="6 3"
            dot={false}
            activeDot={false}
            connectNulls={true}
            isAnimationActive={true}
          />
        </LineChart>
      </ResponsiveContainer>
      <p className="text-xs text-center text-gray-400 tracking-widest mt-1">LAST 7 DAYS</p>
    </div>
  );
};

export default SecurityTimeGraph;

import { motion } from "framer-motion";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { clockTime, percent, speed } from "../../lib/format";
import type { Point } from "../../store/telemetry";

interface Series {
  key: string;
  name: string;
  color: string;
}

interface TrendChartProps {
  data: Record<string, number>[];
  series: Series[];
  height?: number;
  format?: (value: number) => string;
  showGrid?: boolean;
}

function ChartTooltip({
  active,
  payload,
  label,
  format,
}: {
  active?: boolean;
  payload?: { name?: string; value?: number; color?: string }[];
  label?: number;
  format: (v: number) => string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="glass-panel rounded-xl px-3 py-2.5 text-[11px] shadow-xl">
      {label !== undefined && <p className="mb-1.5 text-[10px] text-faint">{clockTime(label)}</p>}
      {payload.map((p) => (
        <div key={p.name} className="flex items-center gap-2">
          <span className="h-1.5 w-1.5 rounded-full" style={{ background: p.color }} />
          <span className="text-muted">{p.name}</span>
          <span className="numeric ml-auto text-ink">{format(p.value ?? 0)}</span>
        </div>
      ))}
    </div>
  );
}

export function TrendChart({ data, series, height = 180, format = (v) => percent(v), showGrid = true }: TrendChartProps) {
  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} style={{ height }} className="w-full">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 8, right: 4, bottom: 0, left: 0 }}>
          <defs>
            {series.map((s) => (
              <linearGradient key={s.key} id={`grad-${s.key}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={s.color} stopOpacity={0.32} />
                <stop offset="100%" stopColor={s.color} stopOpacity={0} />
              </linearGradient>
            ))}
          </defs>
          {showGrid && (
            <CartesianGrid stroke="rgb(var(--c-line) / 0.06)" vertical={false} strokeDasharray="3 5" />
          )}
          <XAxis
            dataKey="t"
            tickFormatter={clockTime}
            tick={{ fill: "rgb(var(--c-faint))", fontSize: 10 }}
            axisLine={false}
            tickLine={false}
            minTickGap={48}
          />
          <YAxis
            tick={{ fill: "rgb(var(--c-faint))", fontSize: 10 }}
            axisLine={false}
            tickLine={false}
            width={38}
            tickFormatter={(v: number) => format(v)}
          />
          <Tooltip content={<ChartTooltip format={format} />} cursor={{ stroke: "rgb(var(--c-line) / 0.16)" }} />
          {series.map((s) => (
            <Area
              key={s.key}
              type="monotone"
              dataKey={s.key}
              name={s.name}
              stroke={s.color}
              strokeWidth={2}
              fill={`url(#grad-${s.key})`}
              isAnimationActive={false}
              dot={false}
              activeDot={{ r: 3, strokeWidth: 0 }}
            />
          ))}
        </AreaChart>
      </ResponsiveContainer>
    </motion.div>
  );
}

export function Sparkline({
  points,
  color = "rgb(var(--c-accent))",
  height = 52,
  format = speed,
}: {
  points: Point[];
  color?: string;
  height?: number;
  format?: (v: number) => string;
}) {
  const data = points.map((p) => ({ t: p.t, v: p.v }));
  return (
    <div style={{ height }} className="w-full overflow-hidden">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 4, right: 0, bottom: 0, left: 0 }}>
          <defs>
            <linearGradient id={`spark-${color.replace(/[^a-z]/gi, "")}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity={0.35} />
              <stop offset="100%" stopColor={color} stopOpacity={0} />
            </linearGradient>
          </defs>
          <Tooltip content={<ChartTooltip format={format} />} cursor={false} />
          <Area
            type="monotone"
            dataKey="v"
            name="Value"
            stroke={color}
            strokeWidth={1.8}
            fill={`url(#spark-${color.replace(/[^a-z]/gi, "")})`}
            isAnimationActive={false}
            dot={false}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

export function chartData(series: Record<string, Point[]>): Record<string, number>[] {
  const length = Math.max(0, ...Object.values(series).map((s) => s.length));
  return Array.from({ length }, (_, i) => {
    const row: Record<string, number> = {};
    for (const [key, points] of Object.entries(series)) {
      const p = points[i];
      if (p) {
        row[key] = p.v;
        row.t = Math.max(row.t ?? 0, p.t);
      }
    }
    return row;
  });
}

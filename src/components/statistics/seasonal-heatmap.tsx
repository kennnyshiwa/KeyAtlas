"use client";

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const MONTH_NAMES = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

interface SeasonalityRow {
  month: number;
  count: number;
}

interface SeasonalHeatmapProps {
  data: SeasonalityRow[];
}

export function SeasonalHeatmap({ data }: SeasonalHeatmapProps) {
  const maxCount = Math.max(...data.map((d) => d.count), 1);

  const chartData = data.map((d) => ({
    month: MONTH_NAMES[d.month - 1] ?? `M${d.month}`,
    count: d.count,
    intensity: d.count / maxCount,
  }));

  // Color scale from cool (low) to warm (high)
  function getColor(intensity: number): string {
    if (intensity > 0.85) return "hsl(333 72% 52%)";
    if (intensity > 0.7) return "hsl(28 88% 54%)";
    if (intensity > 0.55) return "hsl(48 92% 50%)";
    if (intensity > 0.4) return "hsl(160 68% 40%)";
    return "hsl(196 82% 45%)";
  }

  const peakMonth = chartData.reduce((max, d) =>
    d.count > max.count ? d : max
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle>Seasonal Patterns</CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-sm text-muted-foreground mb-4">
          Projects launched per month (all years combined). Peak:{" "}
          <span className="font-medium text-foreground">{peakMonth.month}</span>{" "}
          with {peakMonth.count.toLocaleString()} projects.
        </p>
        <div className="h-[300px]">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
              <XAxis dataKey="month" className="text-xs" />
              <YAxis className="text-xs" />
              <Tooltip
                formatter={(value: number) => [
                  value.toLocaleString(),
                  "Projects",
                ]}
              />
              <Bar dataKey="count" radius={[4, 4, 0, 0]}>
                {chartData.map((entry, index) => (
                  <Cell
                    key={`cell-${index}`}
                    fill={getColor(entry.intensity)}
                  />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}

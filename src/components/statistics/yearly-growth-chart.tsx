"use client";

import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const CATEGORY_COLORS: Record<string, string> = {
  KEYCAPS: "hsl(333 72% 52%)",
  KEYBOARDS: "hsl(196 82% 45%)",
  DESKMATS: "hsl(160 68% 40%)",
  SWITCHES: "hsl(48 92% 50%)",
  ARTISANS: "hsl(276 63% 52%)",
  ACCESSORIES: "hsl(28 88% 54%)",
};

const CATEGORY_LABELS: Record<string, string> = {
  KEYCAPS: "Keycaps",
  KEYBOARDS: "Keyboards",
  DESKMATS: "Deskmats",
  SWITCHES: "Switches",
  ARTISANS: "Artisans",
  ACCESSORIES: "Accessories",
};

interface YearlyGrowthData {
  year: number;
  category: string;
  count: number;
}

interface YearlyGrowthChartProps {
  data: YearlyGrowthData[];
}

export function YearlyGrowthChart({ data }: YearlyGrowthChartProps) {
  // Pivot data: { year, KEYCAPS: n, KEYBOARDS: n, ... }
  const categories = [...new Set(data.map((d) => d.category))];
  const yearMap = new Map<number, Record<string, number>>();

  for (const row of data) {
    if (!yearMap.has(row.year)) {
      yearMap.set(row.year, { year: row.year });
    }
    yearMap.get(row.year)![row.category] = row.count;
  }

  const chartData = [...yearMap.values()].sort(
    (a, b) => (a.year as number) - (b.year as number)
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle>Market Growth Timeline</CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-sm text-muted-foreground mb-4">
          Total projects per year, stacked by category (2010–2026)
        </p>
        <div className="h-[400px]">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
              <XAxis dataKey="year" className="text-xs" />
              <YAxis className="text-xs" />
              <Tooltip />
              <Legend />
              {categories.map((cat) => (
                <Area
                  key={cat}
                  type="monotone"
                  dataKey={cat}
                  name={CATEGORY_LABELS[cat] ?? cat}
                  stackId="1"
                  stroke={CATEGORY_COLORS[cat] ?? "hsl(0 0% 50%)"}
                  fill={CATEGORY_COLORS[cat] ?? "hsl(0 0% 50%)"}
                  fillOpacity={0.6}
                />
              ))}
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}

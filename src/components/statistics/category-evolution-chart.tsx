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

interface YearlyByCategoryRow {
  year: number;
  category: string;
  count: number;
}

interface CategoryEvolutionChartProps {
  data: YearlyByCategoryRow[];
}

export function CategoryEvolutionChart({ data }: CategoryEvolutionChartProps) {
  const categories = [...new Set(data.map((d) => d.category))];

  // Build year -> { cat: count } map
  const yearMap = new Map<number, Record<string, number>>();
  for (const row of data) {
    if (!yearMap.has(row.year)) {
      yearMap.set(row.year, {});
    }
    yearMap.get(row.year)![row.category] = row.count;
  }

  // Normalize to percentages
  const chartData = [...yearMap.entries()]
    .sort(([a], [b]) => a - b)
    .map(([year, cats]) => {
      const total = Object.values(cats).reduce((s, v) => s + v, 0);
      const row: Record<string, number> = { year };
      for (const cat of categories) {
        row[cat] = total > 0 ? ((cats[cat] ?? 0) / total) * 100 : 0;
      }
      return row;
    });

  return (
    <Card>
      <CardHeader>
        <CardTitle>Category Market Share Evolution</CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-sm text-muted-foreground mb-4">
          How category proportions have shifted over time (100% stacked)
        </p>
        <div className="h-[400px]">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
              <XAxis dataKey="year" className="text-xs" />
              <YAxis
                className="text-xs"
                tickFormatter={(v: number) => `${v.toFixed(0)}%`}
                domain={[0, 100]}
              />
              <Tooltip
                formatter={(value: number, name: string) => [
                  `${value.toFixed(1)}%`,
                  CATEGORY_LABELS[name] ?? name,
                ]}
              />
              <Legend
                formatter={(value: string) => CATEGORY_LABELS[value] ?? value}
              />
              {categories.map((cat) => (
                <Area
                  key={cat}
                  type="monotone"
                  dataKey={cat}
                  stackId="1"
                  stroke={CATEGORY_COLORS[cat] ?? "hsl(0 0% 50%)"}
                  fill={CATEGORY_COLORS[cat] ?? "hsl(0 0% 50%)"}
                  fillOpacity={0.7}
                />
              ))}
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}

"use client";

import {
  ComposedChart,
  Line,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface PriceByYearRow {
  year: number;
  category: string;
  avg_price: number;
  sample_size: number;
}

interface PriceTrendsChartProps {
  data: PriceByYearRow[];
}

export function PriceTrendsChart({ data }: PriceTrendsChartProps) {
  // Build per-year chart data with keycap and keyboard avg prices
  const yearMap = new Map<
    number,
    { year: number; keycapPrice?: number; keyboardPrice?: number; keycapSamples?: number; keyboardSamples?: number }
  >();

  for (const row of data) {
    if (!yearMap.has(row.year)) {
      yearMap.set(row.year, { year: row.year });
    }
    const entry = yearMap.get(row.year)!;
    if (row.category === "KEYCAPS") {
      entry.keycapPrice = row.avg_price;
      entry.keycapSamples = row.sample_size;
    } else if (row.category === "KEYBOARDS") {
      entry.keyboardPrice = row.avg_price;
      entry.keyboardSamples = row.sample_size;
    }
  }

  const chartData = [...yearMap.values()]
    .filter((d) => d.year >= 2016)
    .sort((a, b) => a.year - b.year);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Price Trends Over Time</CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-sm text-muted-foreground mb-4">
          Average price by year for keycaps and keyboards (USD)
        </p>
        <div className="h-[400px]">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
              <XAxis dataKey="year" className="text-xs" />
              <YAxis className="text-xs" tickFormatter={(v: number) => `$${v}`} />
              <Tooltip
                formatter={(value: number, name: string) => [
                  `$${value.toFixed(2)}`,
                  name,
                ]}
              />
              <Legend />
              <Area
                type="monotone"
                dataKey="keycapPrice"
                name="Keycap Avg Price"
                stroke="none"
                fill="hsl(333 72% 52%)"
                fillOpacity={0.15}
              />
              <Line
                type="monotone"
                dataKey="keycapPrice"
                name="Keycap Avg Price"
                stroke="hsl(333 72% 52%)"
                strokeWidth={2}
                dot={{ r: 4 }}
              />
              <Line
                type="monotone"
                dataKey="keyboardPrice"
                name="Keyboard Avg Price"
                stroke="hsl(196 82% 45%)"
                strokeWidth={2}
                dot={{ r: 4 }}
              />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}

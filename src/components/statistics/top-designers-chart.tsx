"use client";

import {
  BarChart,
  Bar,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface TopDesignersChartProps {
  data: { name: string; count: number }[];
}

const DESIGNER_COLORS = [
  "hsl(333 72% 52%)",
  "hsl(196 82% 45%)",
  "hsl(160 68% 40%)",
  "hsl(276 63% 52%)",
  "hsl(28 88% 54%)",
  "hsl(48 92% 50%)",
  "hsl(218 80% 58%)",
  "hsl(12 85% 58%)",
  "hsl(172 72% 42%)",
  "hsl(291 63% 55%)",
];

export function TopDesignersChart({ data }: TopDesignersChartProps) {
  if (data.length === 0) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Top 10 Designers</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="h-[300px]">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data} layout="vertical">
              <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
              <XAxis type="number" className="text-xs" />
              <YAxis
                type="category"
                dataKey="name"
                width={100}
                className="text-xs"
              />
              <Tooltip />
              <Bar dataKey="count" radius={[0, 4, 4, 0]}>
                {data.map((_, index) => (
                  <Cell key={`designer-cell-${index}`} fill={DESIGNER_COLORS[index % DESIGNER_COLORS.length]} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}

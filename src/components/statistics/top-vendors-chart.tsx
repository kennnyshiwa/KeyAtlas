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

interface TopVendorsChartProps {
  data: { name: string; count: number }[];
}

const VENDOR_COLORS = [
  "hsl(220 78% 56%)",
  "hsl(145 62% 46%)",
  "hsl(43 86% 54%)",
  "hsl(283 62% 56%)",
  "hsl(20 86% 56%)",
  "hsl(156 66% 42%)",
  "hsl(348 74% 54%)",
  "hsl(194 78% 46%)",
  "hsl(265 58% 56%)",
  "hsl(34 88% 52%)",
];

export function TopVendorsChart({ data }: TopVendorsChartProps) {
  if (data.length === 0) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Top 10 Vendors</CardTitle>
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
                  <Cell key={`vendor-cell-${index}`} fill={VENDOR_COLORS[index % VENDOR_COLORS.length]} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}

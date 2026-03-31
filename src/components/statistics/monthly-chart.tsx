"use client";

import { useRef, useEffect } from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface MonthlyChartProps {
  data: { month: string; count: number }[];
}

export function MonthlyChart({ data }: MonthlyChartProps) {
  const scrollRef = useRef<HTMLDivElement>(null);

  // Scroll to the right (most recent) on mount
  useEffect(() => {
    const el = scrollRef.current;
    if (el) {
      el.scrollLeft = el.scrollWidth;
    }
  }, [data]);

  const barWidth = 40;
  const chartWidth = Math.max(data.length * barWidth, 600);

  // Detect year boundaries for reference lines
  const yearTicks: number[] = [];
  for (let i = 1; i < data.length; i++) {
    const prevYear = data[i - 1].month.slice(0, 4);
    const curYear = data[i].month.slice(0, 4);
    if (curYear !== prevYear) {
      yearTicks.push(i);
    }
  }

  // Format month labels: show "YYYY" at year boundaries, "MMM" otherwise
  const formatTick = (value: string, index: number) => {
    const [year, monthNum] = value.split("-");
    const monthNames = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
    const monthLabel = monthNames[parseInt(monthNum, 10) - 1] || monthNum;
    // Show year label on January or first data point
    if (monthNum === "01" || index === 0) {
      return `${monthLabel} '${year.slice(2)}`;
    }
    return monthLabel;
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          <span>Group Buys per Month</span>
          <span className="text-sm font-normal text-muted-foreground">
            {data.length} months · scroll →
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="relative">
          {/* Fade edges to indicate scrollability */}
          <div className="pointer-events-none absolute inset-y-0 left-0 w-8 bg-gradient-to-r from-card to-transparent z-10" />
          <div className="pointer-events-none absolute inset-y-0 right-0 w-8 bg-gradient-to-l from-card to-transparent z-10" />
          <div
            ref={scrollRef}
            className="overflow-x-auto scrollbar-thin"
            style={{ height: 320 }}
          >
            <BarChart
              width={chartWidth}
              height={300}
              data={data}
              margin={{ top: 5, right: 20, left: 10, bottom: 5 }}
            >
              <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
              <XAxis
                dataKey="month"
                className="text-xs"
                tickFormatter={formatTick}
                interval={0}
                tick={{ fontSize: 10 }}
                angle={-45}
                textAnchor="end"
                height={60}
              />
              <YAxis className="text-xs" />
              <Tooltip
                labelFormatter={(label: string) => {
                  const [year, monthNum] = label.split("-");
                  const monthNames = ["January","February","March","April","May","June","July","August","September","October","November","December"];
                  return `${monthNames[parseInt(monthNum, 10) - 1]} ${year}`;
                }}
              />
              <Bar
                dataKey="count"
                fill="var(--chart-1)"
                radius={[4, 4, 0, 0]}
              />
            </BarChart>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

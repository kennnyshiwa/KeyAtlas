"use client";

import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const TAG_COLORS = [
  "hsl(333 72% 52%)",
  "hsl(196 82% 45%)",
  "hsl(160 68% 40%)",
  "hsl(48 92% 50%)",
  "hsl(276 63% 52%)",
  "hsl(28 88% 54%)",
  "hsl(0 72% 52%)",
  "hsl(220 72% 52%)",
  "hsl(120 50% 40%)",
  "hsl(300 50% 50%)",
];

interface TagTrendRow {
  year: number;
  tag: string;
  count: number;
}

interface TagTrendsChartProps {
  data: TagTrendRow[];
}

export function TagTrendsChart({ data }: TagTrendsChartProps) {
  // Exclude noisy tags
  const excluded = new Set(["geekhack", "enriched"]);
  const filtered = data.filter((d) => !excluded.has(d.tag.toLowerCase()));

  // Find top 10 tags by total count across all years
  const tagTotals = new Map<string, number>();
  for (const row of filtered) {
    tagTotals.set(row.tag, (tagTotals.get(row.tag) ?? 0) + row.count);
  }
  const topTags = [...tagTotals.entries()]
    .sort(([, a], [, b]) => b - a)
    .slice(0, 10)
    .map(([tag]) => tag);

  const topTagSet = new Set(topTags);
  const relevant = filtered.filter((d) => topTagSet.has(d.tag));

  // Pivot: { year, tag1: count, tag2: count, ... }
  const yearMap = new Map<number, Record<string, number>>();
  for (const row of relevant) {
    if (!yearMap.has(row.year)) {
      yearMap.set(row.year, { year: row.year });
    }
    yearMap.get(row.year)![row.tag] = row.count;
  }

  const chartData = [...yearMap.values()].sort(
    (a, b) => (a.year as number) - (b.year as number)
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle>Tag &amp; Material Trends</CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-sm text-muted-foreground mb-4">
          Top 10 tags by usage over time (excluding generic tags)
        </p>
        <div className="h-[400px]">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
              <XAxis dataKey="year" className="text-xs" />
              <YAxis className="text-xs" />
              <Tooltip />
              <Legend />
              {topTags.map((tag, i) => (
                <Line
                  key={tag}
                  type="monotone"
                  dataKey={tag}
                  name={tag}
                  stroke={TAG_COLORS[i % TAG_COLORS.length]}
                  strokeWidth={2}
                  dot={false}
                  connectNulls
                />
              ))}
            </LineChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}

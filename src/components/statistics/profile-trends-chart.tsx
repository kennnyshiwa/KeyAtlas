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

const PROFILE_COLORS = [
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
  "hsl(180 60% 45%)",
  "hsl(60 70% 45%)",
];

// Format tag name for display: "cherry-profile" -> "Cherry"
function formatProfileName(tag: string): string {
  return tag
    .replace(/-profile$/, "")
    .split("-")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

interface TagTrendRow {
  year: number;
  tag: string;
  count: number;
}

interface ProfileTrendsChartProps {
  data: TagTrendRow[];
}

export function ProfileTrendsChart({ data }: ProfileTrendsChartProps) {
  // Only keep profile tags
  const profileData = data.filter((d) => d.tag.endsWith("-profile"));

  // Rank by total
  const totals = new Map<string, number>();
  for (const row of profileData) {
    totals.set(row.tag, (totals.get(row.tag) ?? 0) + row.count);
  }
  const topProfiles = [...totals.entries()]
    .sort(([, a], [, b]) => b - a)
    .map(([tag]) => tag);

  const profileSet = new Set(topProfiles);
  const relevant = profileData.filter((d) => profileSet.has(d.tag));

  // Pivot: { year, Cherry: count, SA: count, ... }
  const yearMap = new Map<number, Record<string, number>>();
  for (const row of relevant) {
    if (!yearMap.has(row.year)) {
      yearMap.set(row.year, { year: row.year });
    }
    const label = formatProfileName(row.tag);
    yearMap.get(row.year)![label] = row.count;
  }

  const chartData = [...yearMap.values()].sort(
    (a, b) => (a.year as number) - (b.year as number)
  );

  const displayNames = topProfiles.map(formatProfileName);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Keycap Profile Trends</CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-sm text-muted-foreground mb-4">
          Keycap profile popularity over time
        </p>
        <div className="h-[400px]">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
              <XAxis dataKey="year" className="text-xs" />
              <YAxis className="text-xs" />
              <Tooltip />
              <Legend />
              {displayNames.map((name, i) => (
                <Line
                  key={name}
                  type="monotone"
                  dataKey={name}
                  name={name}
                  stroke={PROFILE_COLORS[i % PROFILE_COLORS.length]}
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

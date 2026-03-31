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

const REGION_COLORS: Record<string, string> = {
  US: "hsl(196 82% 45%)",
  EU: "hsl(160 68% 40%)",
  Asia: "hsl(333 72% 52%)",
  OCE: "hsl(276 63% 52%)",
  Global: "hsl(48 92% 50%)",
};

function getPrimaryRegion(regions: string[] | null): string {
  if (!regions || regions.length === 0) return "Global";
  // Heuristic: first region listed is primary
  const first = regions[0].toUpperCase();
  if (first.includes("US") || first.includes("NA") || first.includes("AMERICA")) return "US";
  if (first.includes("EU") || first.includes("EUROPE")) return "EU";
  if (first.includes("ASIA") || first.includes("CN") || first.includes("KR") || first.includes("JP") || first.includes("SEA")) return "Asia";
  if (first.includes("OCE") || first.includes("AU")) return "OCE";
  return "Global";
}

interface VendorRow {
  name: string;
  regions: string[] | null;
  count: number;
}

interface VendorMarketShareProps {
  data: VendorRow[];
  totalProjects: number;
}

export function VendorMarketShare({ data, totalProjects }: VendorMarketShareProps) {
  const chartData = data.map((v) => ({
    name: v.name,
    count: v.count,
    pct: totalProjects > 0 ? (v.count / totalProjects) * 100 : 0,
    region: getPrimaryRegion(v.regions),
  }));

  return (
    <Card>
      <CardHeader>
        <CardTitle>Vendor Market Share</CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-sm text-muted-foreground mb-4">
          Top 20 vendors by project count
        </p>
        <div className="h-[500px]">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData} layout="vertical" margin={{ left: 100 }}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
              <XAxis type="number" className="text-xs" />
              <YAxis
                type="category"
                dataKey="name"
                className="text-xs"
                width={95}
                tick={{ fontSize: 11 }}
              />
              <Tooltip
                formatter={(value: number, _name: string, props: { payload?: { pct?: number } }) => [
                  `${value} projects (${(props.payload?.pct ?? 0).toFixed(1)}%)`,
                  "Count",
                ]}
              />
              <Bar dataKey="count" radius={[0, 4, 4, 0]}>
                {chartData.map((entry, index) => (
                  <Cell
                    key={`cell-${index}`}
                    fill={REGION_COLORS[entry.region] ?? "hsl(0 0% 50%)"}
                  />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
        <div className="flex flex-wrap gap-4 mt-4 text-xs text-muted-foreground">
          {Object.entries(REGION_COLORS).map(([region, color]) => (
            <div key={region} className="flex items-center gap-1.5">
              <span
                className="inline-block h-2.5 w-2.5 rounded-sm"
                style={{ backgroundColor: color }}
              />
              {region}
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

"use client";

import { useState, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

interface DesignerRow {
  designer: string;
  total: number;
  keycaps: number;
  keyboards: number;
  ics: number;
  gbs: number;
  avg_price: number | null;
  first_year: number;
  last_year: number;
}

interface DesignerLeaderboardProps {
  data: DesignerRow[];
}

type SortKey = "total" | "keycaps" | "keyboards" | "gbs" | "avg_price" | "span";

export function DesignerLeaderboard({ data }: DesignerLeaderboardProps) {
  const [sortBy, setSortBy] = useState<SortKey>("total");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [search, setSearch] = useState("");

  const filtered = useMemo(() => {
    if (!search.trim()) return data;
    const q = search.toLowerCase();
    return data.filter((d) => d.designer.toLowerCase().includes(q));
  }, [data, search]);

  const sorted = useMemo(() => {
    return [...filtered].sort((a, b) => {
      let av: number, bv: number;
      switch (sortBy) {
        case "span":
          av = a.last_year - a.first_year;
          bv = b.last_year - b.first_year;
          break;
        case "avg_price":
          av = a.avg_price ?? 0;
          bv = b.avg_price ?? 0;
          break;
        default:
          av = a[sortBy];
          bv = b[sortBy];
      }
      return sortDir === "desc" ? bv - av : av - bv;
    });
  }, [filtered, sortBy, sortDir]);

  const handleSort = (key: SortKey) => {
    if (sortBy === key) {
      setSortDir((d) => (d === "desc" ? "asc" : "desc"));
    } else {
      setSortBy(key);
      setSortDir("desc");
    }
  };

  const sortIcon = (key: SortKey) => {
    if (sortBy !== key) return "";
    return sortDir === "desc" ? " ↓" : " ↑";
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          <span>Designer Leaderboard</span>
          <span className="text-sm font-normal text-muted-foreground">
            {data.length.toLocaleString()} designers
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="mb-4">
          <Input
            placeholder="Search designers…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="max-w-xs"
          />
        </div>
        <div className="overflow-x-auto">
          <div className="max-h-[500px] overflow-y-auto scrollbar-thin">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-card z-10">
                <tr className="border-b text-left">
                  <th className="pb-2 pr-4 font-medium">#</th>
                  <th className="pb-2 pr-4 font-medium">Designer</th>
                  <th
                    className="pb-2 pr-4 font-medium cursor-pointer hover:text-foreground text-muted-foreground"
                    onClick={() => handleSort("total")}
                  >
                    Projects{sortIcon("total")}
                  </th>
                  <th
                    className="pb-2 pr-4 font-medium cursor-pointer hover:text-foreground text-muted-foreground"
                    onClick={() => handleSort("keycaps")}
                  >
                    Keycaps{sortIcon("keycaps")}
                  </th>
                  <th
                    className="pb-2 pr-4 font-medium cursor-pointer hover:text-foreground text-muted-foreground"
                    onClick={() => handleSort("keyboards")}
                  >
                    Keyboards{sortIcon("keyboards")}
                  </th>
                  <th
                    className="pb-2 pr-4 font-medium cursor-pointer hover:text-foreground text-muted-foreground"
                    onClick={() => handleSort("gbs")}
                  >
                    IC→GB{sortIcon("gbs")}
                  </th>
                  <th
                    className="pb-2 pr-4 font-medium cursor-pointer hover:text-foreground text-muted-foreground"
                    onClick={() => handleSort("avg_price")}
                  >
                    Avg Price{sortIcon("avg_price")}
                  </th>
                  <th
                    className="pb-2 font-medium cursor-pointer hover:text-foreground text-muted-foreground"
                    onClick={() => handleSort("span")}
                  >
                    Active Years{sortIcon("span")}
                  </th>
                </tr>
              </thead>
              <tbody>
                {sorted.map((d, i) => (
                  <tr key={d.designer} className="border-b last:border-0">
                    <td className="py-2 pr-4 tabular-nums text-muted-foreground">
                      {i + 1}
                    </td>
                    <td className="py-2 pr-4 font-medium truncate max-w-[200px]">
                      {d.designer}
                    </td>
                    <td className="py-2 pr-4 tabular-nums">{d.total}</td>
                    <td className="py-2 pr-4 tabular-nums">{d.keycaps}</td>
                    <td className="py-2 pr-4 tabular-nums">{d.keyboards}</td>
                    <td className="py-2 pr-4 tabular-nums">
                      {d.ics + d.gbs > 0
                        ? `${d.gbs}/${d.ics + d.gbs}`
                        : "—"}
                    </td>
                    <td className="py-2 pr-4 tabular-nums">
                      {d.avg_price != null ? `$${d.avg_price.toFixed(0)}` : "—"}
                    </td>
                    <td className="py-2 tabular-nums">
                      {d.first_year === d.last_year
                        ? d.first_year
                        : `${d.first_year}–${d.last_year}`}
                    </td>
                  </tr>
                ))}
                {sorted.length === 0 && (
                  <tr>
                    <td colSpan={8} className="py-8 text-center text-muted-foreground">
                      No designers found
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

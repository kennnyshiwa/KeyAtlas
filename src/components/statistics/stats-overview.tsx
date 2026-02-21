import { Card, CardContent } from "@/components/ui/card";

interface StatsOverviewProps {
  stats: {
    label: string;
    value: number;
  }[];
}

export function StatsOverview({ stats }: StatsOverviewProps) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
      {stats.map((stat) => (
        <Card key={stat.label}>
          <CardContent className="pt-6">
            <div className="text-2xl font-bold">{stat.value}</div>
            <p className="text-muted-foreground text-sm">{stat.label}</p>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

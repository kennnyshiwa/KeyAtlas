import { prisma } from "@/lib/prisma";
import { CalendarView } from "@/components/calendar/calendar-view";
import { PageHeader } from "@/components/shared/page-header";

export const metadata = {
  title: "Calendar",
  description: "Project timeline calendar view.",
};

interface CalendarPageProps {
  searchParams: Promise<{
    month?: string;
    year?: string;
  }>;
}

export default async function CalendarPage({ searchParams }: CalendarPageProps) {
  const params = await searchParams;
  const now = new Date();
  const year = Number(params.year ?? now.getFullYear());
  const month = Number(params.month ?? now.getMonth() + 1);

  const startOfMonth = new Date(year, month - 1, 1);
  const endOfMonth = new Date(year, month, 0, 23, 59, 59);

  const projects = await prisma.project.findMany({
    where: {
      published: true,
      OR: [
        { icDate: { gte: startOfMonth, lte: endOfMonth } },
        { gbStartDate: { gte: startOfMonth, lte: endOfMonth } },
        { gbEndDate: { gte: startOfMonth, lte: endOfMonth } },
      ],
    },
    select: {
      id: true,
      title: true,
      slug: true,
      status: true,
      icDate: true,
      gbStartDate: true,
      gbEndDate: true,
    },
    orderBy: { title: "asc" },
  });

  return (
    <div className="space-y-6">
      <PageHeader
        title="Calendar"
        description="View upcoming interest checks, group buys, and deadlines."
      />
      <CalendarView
        projects={projects}
        year={year}
        month={month}
      />
    </div>
  );
}

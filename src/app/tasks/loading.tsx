import { PageHead, RowsSkeleton, Skeleton } from "@/components/ui";

/**
 * Shown the instant this tab is opened, while the page's own queries run.
 * The title is known without asking anything, so it is real rather than a
 * grey bar; only what needs the database is a placeholder.
 */
export default function Loading() {
  return (
    <section className="flex flex-col gap-6 pt-10">
      <PageHead title="Tasks" action={<Skeleton className="h-9 w-32 rounded-lg" />} />
      <Skeleton className="h-8 w-56 rounded-lg" />
      <div className="glass p-4">
        <RowsSkeleton rows={4} />
      </div>
    </section>
  );
}

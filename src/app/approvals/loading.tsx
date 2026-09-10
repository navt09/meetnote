import { PageHead, RowsSkeleton, Skeleton } from "@/components/ui";

/**
 * Shown the instant this tab is opened, while the page's own queries run.
 * The title is known without asking anything, so it is real rather than a
 * grey bar; only what needs the database is a placeholder.
 */
export default function Loading() {
  return (
    <section className="flex flex-col gap-6 pt-10">
      <PageHead title="Approvals" action={<Skeleton className="h-9 w-28 rounded-lg" />} />
      <div className="glass p-4">
        <RowsSkeleton rows={2} />
      </div>
    </section>
  );
}

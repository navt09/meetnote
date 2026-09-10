import { PageHead, RowsSkeleton } from "@/components/ui";

/**
 * Shown the instant this tab is opened, while the page's own queries run.
 * The title is known without asking anything, so it is real rather than a
 * grey bar; only what needs the database is a placeholder.
 */
export default function Loading() {
  return (
    <section className="flex flex-col gap-6 pt-10">
      <PageHead title="Settings" meta="Your account, and the tools your approved work goes to." />
      <div className="glass p-5">
        <RowsSkeleton rows={2} />
      </div>
      <div className="glass p-5">
        <RowsSkeleton rows={4} />
      </div>
    </section>
  );
}

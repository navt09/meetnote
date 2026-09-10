import { PageHead, RowsSkeleton } from "@/components/ui";

/**
 * Shown the instant this tab is opened, while the page's own queries run.
 * The title is known without asking anything, so it is real rather than a
 * grey bar; only what needs the database is a placeholder.
 */
export default function Loading() {
  return (
    <section className="flex flex-col gap-6 pt-10">
      <PageHead title="Owner" meta="Everyone who has signed up, and what running them costs." />
      <div className="glass p-5">
        <RowsSkeleton rows={5} />
      </div>
    </section>
  );
}

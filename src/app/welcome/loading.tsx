import { PageHead, RowsSkeleton } from "@/components/ui";

/**
 * Shown the instant the tab opens, while the tier is read. The title is known
 * without asking anything, so it is real rather than a grey bar.
 */
export default function Loading() {
  return (
    <section className="flex flex-col gap-6 pt-10">
      <PageHead title="Your account is ready" meta="Pick how you want to start. You can change this whenever you like." />
      <div className="grid gap-4 md:grid-cols-2">
        <div className="rounded-xl border border-panel-border bg-panel-hi p-5">
          <RowsSkeleton rows={3} />
        </div>
        <div className="rounded-xl border border-panel-border p-5">
          <RowsSkeleton rows={3} />
        </div>
      </div>
    </section>
  );
}

import { PageHead, Skeleton } from "@/components/ui";

/**
 * Shown the instant this tab is opened, while the page's own queries run.
 * The title is known without asking anything, so it is real rather than a
 * grey bar; only what needs the database is a placeholder.
 */
export default function Loading() {
  return (
    <section className="flex flex-col gap-6 pt-10">
      <PageHead title="Record" meta="Nothing joins the call. Your browser does the recording, on this machine." />
      <div className="glass p-6 sm:p-8">
        <div className="flex items-center justify-between">
          <Skeleton className="h-6 w-20 rounded-md" />
          <Skeleton className="h-9 w-24" />
        </div>
        <Skeleton className="mt-6 h-[100px] w-full rounded-lg sm:h-[120px]" />
        <div className="mt-6 flex justify-center">
          <Skeleton className="h-[76px] w-[76px] rounded-full" />
        </div>
      </div>
    </section>
  );
}

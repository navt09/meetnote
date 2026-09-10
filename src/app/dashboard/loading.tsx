import { RowsSkeleton, Skeleton } from "@/components/ui";

/**
 * Shown the instant Home is opened. It mirrors the real page's shape - one
 * figure, a row of three, then two columns - so nothing jumps when the
 * numbers arrive.
 */
export default function Loading() {
  return (
    <section className="ledger pt-4" aria-hidden>
      <div>
        <Skeleton className="h-3 w-20" />
        <Skeleton className="mt-3 h-12 w-16" />
        <Skeleton className="mt-3 h-3 w-56" />
      </div>
      <div>
        <div className="strip sm:grid-cols-3">
          {[0, 1, 2].map((i) => (
            <div key={i}>
              <Skeleton className="h-3 w-28" />
              <Skeleton className="mt-3 h-7 w-14" />
              <Skeleton className="mt-3 h-3 w-24" />
            </div>
          ))}
        </div>
      </div>
      <div>
        <div className="strip lg:grid-cols-2">
          <div className="!p-5"><RowsSkeleton rows={3} /></div>
          <div className="!p-5"><RowsSkeleton rows={2} /></div>
        </div>
      </div>
    </section>
  );
}

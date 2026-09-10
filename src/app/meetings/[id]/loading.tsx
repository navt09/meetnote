import { NotesSkeleton, Skeleton } from "@/components/ui";

/** Shown while one meeting is fetched. Mirrors the real page's shape. */
export default function Loading() {
  return (
    <section className="flex flex-col gap-6 pt-10" aria-hidden>
      <div>
        <Skeleton className="h-3 w-20" />
        <Skeleton className="mt-4 h-9 w-3/4" />
        <Skeleton className="mt-3 h-3 w-64" />
      </div>
      <NotesSkeleton />
    </section>
  );
}

import type { TaskPriority } from "@/lib/task";

/**
 * Priority, shown the same way everywhere it appears.
 *
 * It used to be a red outlined pill reading "high", floated to the right and
 * shown only for high. That made it the loudest thing in a row while telling
 * you nothing about the other two thirds of your tasks, and an outlined box
 * around a single word reads as a badge rather than as a property of the work.
 *
 * A dot and a word in the meta line says the same thing in the place you are
 * already reading, for every level. The stripe down the side of the row is
 * what you actually scan; this is what you read once you have stopped.
 */

export const PRIORITY_STRIPE: Record<TaskPriority, string> = {
  high: "var(--danger)",
  medium: "var(--warn)",
  low: "var(--panel-border-hi)",
};

const TEXT: Record<TaskPriority, string> = {
  high: "text-danger",
  medium: "text-warn",
  low: "text-faint",
};

const LABEL: Record<TaskPriority, string> = {
  high: "High",
  medium: "Medium",
  low: "Low",
};

export function PriorityTag({ priority, dimmed = false }: { priority: TaskPriority; dimmed?: boolean }) {
  return (
    <span className={`inline-flex items-center gap-1.5 font-medium ${dimmed ? "text-faint" : TEXT[priority]}`}>
      <span
        aria-hidden
        className="h-1.5 w-1.5 rounded-full"
        style={{ background: dimmed ? "var(--panel-border-hi)" : PRIORITY_STRIPE[priority] }}
      />
      {LABEL[priority]}
    </span>
  );
}

import type { TaskPriority } from "@/lib/task";

/**
 * Priority, shown the same way everywhere it appears.
 *
 * Filled rather than outlined: on a light ground an outlined chip reads as a
 * disabled control, and priority is the one thing on these rows people scan
 * for. High is the work colour, so a task that needs attention and the band it
 * sits in agree; medium is a warm amber; low and done recede into the page.
 */

const STYLE: Record<TaskPriority, string> = {
  high: "flag-high",
  medium: "flag-med",
  low: "flag-off",
};

const LABEL: Record<TaskPriority, string> = {
  high: "High",
  medium: "Medium",
  low: "Low",
};

export function PriorityFlag({ priority, done = false }: { priority: TaskPriority; done?: boolean }) {
  if (done) return <span className="flag flag-off">Done</span>;
  return <span className={`flag ${STYLE[priority]}`}>{LABEL[priority]}</span>;
}

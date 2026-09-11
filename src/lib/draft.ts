import { z } from "zod";
import type { LlmUsage } from "./cost";

export type DraftKind = "ticket" | "email";
export type DraftStatus = "pending" | "approved" | "dismissed";

/** Database row. */
export type DraftRow = {
  id: string;
  user_id: string;
  meeting_id: string;
  task_id: string | null;
  kind: DraftKind;
  subject: string;
  body: string;
  recipient: string | null;
  status: DraftStatus;
  approved_at: string | null;
  destination: string | null;
  external_url: string | null;
  model: string | null;
  usage: LlmUsage | null;
  cost_usd: number;
  created_at: string;
  updated_at: string;
};

/** What the browser sees. No user id, no token counts, no row timestamps. */
export type PublicDraft = {
  id: string;
  meetingId: string;
  meetingTitle: string;
  taskId: string | null;
  kind: DraftKind;
  subject: string;
  body: string;
  recipient: string | null;
  status: DraftStatus;
  approvedAt: string | null;
  externalUrl: string | null;
  createdAt: string;
};

/**
 * Identifies an email draft by who it is for, since an email draft carries no
 * task id: it belongs to a person in a meeting, not to one task. The unique
 * index on (meeting, recipient) is keyed the same way, so this is the same
 * notion of "already drafted" the database enforces.
 *
 * Case-folded, because the recipient is a name out of a transcript and the
 * same person can be written two ways across two extractions.
 */
export function emailDraftKey(meetingId: string, recipient: string): string {
  return `${meetingId}|${recipient.trim().toLowerCase()}`;
}

export function toPublicDraft(row: DraftRow, meetingTitle: string): PublicDraft {
  return {
    id: row.id,
    meetingId: row.meeting_id,
    meetingTitle,
    taskId: row.task_id,
    kind: row.kind,
    subject: row.subject,
    body: row.body,
    recipient: row.recipient,
    status: row.status,
    approvedAt: row.approved_at,
    externalUrl: row.external_url,
    createdAt: row.created_at,
  };
}

/** What the model must return. Deliberately small: text only, no metadata. */
export const TicketDraft = z.object({
  subject: z.string().describe("Ticket title, imperative, under 80 characters"),
  body: z
    .string()
    .describe(
      "Markdown ticket description. Sections: what was said in the meeting, what needs doing, and how we'll know it's done. Only facts from the transcript.",
    ),
});

export const EmailDraft = z.object({
  subject: z.string().describe("Email subject line, under 70 characters"),
  body: z.string().describe("Plain text email body, short and direct, signed off with a placeholder name"),
});

export type TicketDraft = z.infer<typeof TicketDraft>;
export type EmailDraft = z.infer<typeof EmailDraft>;

/** Approved and pending first, newest first within each. Pure. */
export function sortDrafts(drafts: PublicDraft[]): PublicDraft[] {
  const rank: Record<DraftStatus, number> = { pending: 0, approved: 1, dismissed: 2 };
  return [...drafts].sort((a, b) => {
    if (rank[a.status] !== rank[b.status]) return rank[a.status] - rank[b.status];
    return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
  });
}

/** The text a person copies out to paste into Linear, Jira or an email client. */
export function draftToClipboard(d: Pick<PublicDraft, "kind" | "subject" | "body" | "recipient">): string {
  if (d.kind === "email") {
    const to = d.recipient ? `To: ${d.recipient}\n` : "";
    return `${to}Subject: ${d.subject}\n\n${d.body}\n`;
  }
  return `# ${d.subject}\n\n${d.body}\n`;
}

export function kindLabel(kind: DraftKind): string {
  return kind === "ticket" ? "Ticket" : "Email";
}

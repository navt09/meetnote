import "server-only";
import { accessTokenFor, graph } from "./microsoft";
import type { MicrosoftConfig, MicrosoftCredentials } from "../connectors";

/**
 * The three things From the Call does with a Microsoft account that a personal
 * account can also do: send a mail, block out time, and keep a task.
 *
 * All three are Microsoft Graph under the one connection made in
 * microsoft.ts. Teams and SharePoint live apart because they need a work
 * tenant and a separate consent; these do not.
 */

export type SentMail = { id: string };
export type CreatedEvent = { id: string; url: string; start: string };
export type CreatedTask = { id: string; url: string; title: string };

/**
 * Sends as the signed-in person, from their own mailbox.
 *
 * `saveToSentItems` is on deliberately: a message the sender cannot find in
 * their own Sent folder looks like it was never sent, and the first thing
 * anybody does after approving is go and check.
 *
 * The body goes as plain text rather than HTML. Draft bodies are Markdown, and
 * turning Markdown into HTML here would mean rendering model output into
 * markup inside somebody's mail client; the same reasoning keeps the approvals
 * preview rendering to React elements rather than HTML.
 */
export async function sendMail(
  userId: string,
  creds: MicrosoftCredentials,
  config: MicrosoftConfig,
  message: { to: string; subject: string; body: string },
): Promise<SentMail> {
  const token = await accessTokenFor(userId, creds, config);
  await graph<void>(token, "/me/sendMail", {
    method: "POST",
    body: {
      message: {
        subject: message.subject,
        body: { contentType: "Text", content: message.body },
        toRecipients: [{ emailAddress: { address: message.to } }],
      },
      saveToSentItems: true,
    },
  });
  // sendMail answers 202 with no body, so there is no id to return. The Sent
  // folder is the receipt.
  return { id: "sent" };
}

/**
 * Blocks time out on the person's own calendar. Nobody is invited and nobody
 * is emailed: `isReminderOn` stays default and there are no attendees, so this
 * cannot turn into a meeting invite somebody else receives.
 *
 * The times are sent with a timezone of UTC and ISO instants, which is what
 * `toIso` already produces for the Google path.
 */
export async function createEvent(
  userId: string,
  creds: MicrosoftCredentials,
  config: MicrosoftConfig,
  event: { title: string; start: string; end: string; description: string },
): Promise<CreatedEvent> {
  const token = await accessTokenFor(userId, creds, config);
  const created = await graph<{ id: string; webLink?: string; start?: { dateTime?: string } }>(token, "/me/events", {
    method: "POST",
    body: {
      subject: event.title,
      body: { contentType: "Text", content: event.description },
      start: { dateTime: event.start.replace(/Z$/, ""), timeZone: "UTC" },
      end: { dateTime: event.end.replace(/Z$/, ""), timeZone: "UTC" },
      // A private block, not an invitation.
      attendees: [],
      isOnlineMeeting: false,
    },
  });
  return {
    id: created.id,
    url: created.webLink ?? "https://outlook.office.com/calendar/",
    start: event.start,
  };
}

/**
 * Puts a follow-up on the person's Microsoft To Do list.
 *
 * To Do rather than Planner, and the distinction matters: Planner boards belong
 * to a Microsoft 365 group and so need a work tenant, while To Do is on every
 * account including personal ones. `Tasks.ReadWrite` covers both, so the scope
 * says nothing about which is reachable.
 *
 * The list is whichever To Do list is the default one. Choosing a list would
 * be another picker for very little: a task nobody can find is the failure
 * mode, and the default list is the one people actually look at.
 */
export async function createTodo(
  userId: string,
  creds: MicrosoftCredentials,
  config: MicrosoftConfig,
  task: { title: string; body: string; dueAt?: string | null },
): Promise<CreatedTask> {
  const token = await accessTokenFor(userId, creds, config);

  const lists = await graph<{ value: { id: string; wellknownListName?: string; displayName?: string }[] }>(
    token,
    "/me/todo/lists",
  );
  const list =
    (lists.value ?? []).find((l) => l.wellknownListName === "defaultList") ?? (lists.value ?? [])[0];
  if (!list) throw new Error("That Microsoft account has no To Do list to add to.");

  const created = await graph<{ id: string }>(token, `/me/todo/lists/${list.id}/tasks`, {
    method: "POST",
    body: {
      title: task.title,
      body: { contentType: "text", content: task.body },
      // Graph wants a date-time plus a zone here, and rejects a bare instant.
      ...(task.dueAt ? { dueDateTime: { dateTime: task.dueAt.replace(/Z$/, ""), timeZone: "UTC" } } : {}),
    },
  });

  return {
    id: created.id,
    // To Do has no per-task permalink, so this opens the app rather than
    // pretending to deep-link at a task that cannot be addressed.
    url: "https://to-do.office.com/tasks/",
    title: task.title,
  };
}

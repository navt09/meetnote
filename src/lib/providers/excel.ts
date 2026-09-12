import "server-only";
import { accessTokenFor, graph } from "./microsoft";
import type { MicrosoftConfig, MicrosoftCredentials } from "../connectors";

/**
 * A task register in a real Excel workbook.
 *
 * Unlike every other connector this is not a destination for one approved
 * draft. It is a running list somebody keeps: each meeting appends its tasks
 * to the same sheet, so the workbook accumulates into the thing people
 * actually maintain by hand today.
 *
 * Which is why it is not part of the approval queue. A draft is text a model
 * wrote that somebody else will read as though the user wrote it; that is what
 * approval is for. This copies rows the person is already looking at into
 * their own spreadsheet, and making them approve what they can already see
 * would be ceremony.
 *
 * The workbook is chosen, never created. Making one would mean shipping a
 * binary .xlsx in the source and uploading it, because Graph's workbook APIs
 * refuse an empty file: a zero-byte .xlsx is not a workbook. Asking somebody
 * to press New > Excel workbook in OneDrive once is a smaller ask than that.
 */

export const TABLE_NAME = "FromTheCall";

/** One column each, in the order somebody reading the sheet would want them. */
export const COLUMNS = ["Meeting", "Recorded", "Task", "Owner", "Due", "Priority", "Blocked by", "Added"] as const;

export type Workbook = { id: string; name: string; url?: string };
export type TaskRowValues = {
  meeting: string;
  recorded: string;
  task: string;
  owner: string;
  due: string;
  priority: string;
  blockedBy: string;
};

/**
 * The .xlsx files in this person's OneDrive, newest first.
 *
 * Graph's search is used rather than a directory walk: a register is as likely
 * to live three folders down as at the root, and walking would be many calls
 * to answer one question.
 */
export async function listWorkbooks(
  userId: string,
  creds: MicrosoftCredentials,
  config: MicrosoftConfig,
): Promise<Workbook[]> {
  const token = await accessTokenFor(userId, creds, config);
  // Graph's search reads file *contents* as well as names, so asking for
  // ".xlsx" also returns anything that mentions it — a real search here came
  // back with an index.js. The name filter below is what makes the result
  // correct; the generous $top is what stops that noise crowding out an actual
  // workbook before the filter ever sees it.
  const found = await graph<{ value: { id: string; name: string; webUrl?: string; file?: { mimeType?: string } }[] }>(
    token,
    "/me/drive/search(q='.xlsx')",
    { query: { $top: "200", $select: "id,name,webUrl,file" } },
  );
  return (found.value ?? [])
    .filter((f) => f.file && f.name.toLowerCase().endsWith(".xlsx"))
    .map((f) => ({ id: f.id, name: f.name, url: f.webUrl }));
}

type GraphTable = { id: string; name: string };

/**
 * The table rows get appended to, creating it on first use.
 *
 * Appending to a *table* rather than to the used range is what makes this
 * survive somebody editing the sheet: a table grows with its own rows, keeps
 * its header, and does not care what else is on the worksheet. Writing to the
 * next free row by arithmetic breaks the moment anyone sorts, filters or types
 * underneath it.
 */
async function ensureTable(token: string, workbookId: string): Promise<GraphTable> {
  const existing = await graph<{ value: GraphTable[] }>(token, `/me/drive/items/${workbookId}/workbook/tables`);
  const found = (existing.value ?? []).find((t) => t.name === TABLE_NAME);
  if (found) return found;

  const sheets = await graph<{ value: { name: string }[] }>(
    token,
    `/me/drive/items/${workbookId}/workbook/worksheets`,
  );
  const sheet = (sheets.value ?? [])[0];
  if (!sheet) throw new Error("That workbook has no worksheets to write to.");

  // The header has to exist before the table is created over it, or the table
  // is created with Microsoft's own Column1..ColumnN names and the sheet reads
  // as machine output rather than a list somebody keeps.
  const lastColumn = String.fromCharCode("A".charCodeAt(0) + COLUMNS.length - 1);
  const address = `A1:${lastColumn}1`;
  await graph(token, `/me/drive/items/${workbookId}/workbook/worksheets/${sheet.name}/range(address='${address}')`, {
    method: "PATCH",
    body: { values: [COLUMNS] },
  });

  const table = await graph<GraphTable>(
    token,
    `/me/drive/items/${workbookId}/workbook/worksheets/${sheet.name}/tables/add`,
    { method: "POST", body: { address, hasHeaders: true } },
  );
  await graph(token, `/me/drive/items/${workbookId}/workbook/tables/${table.id}`, {
    method: "PATCH",
    body: { name: TABLE_NAME },
  });
  return { ...table, name: TABLE_NAME };
}

/**
 * Appends one row per task. Returns how many were written.
 *
 * All of them in a single `rows/add`, which is one call and one recalculation
 * rather than one per task: a meeting with fifteen tasks would otherwise be
 * fifteen round trips to somebody else's server.
 */
export async function appendTasks(
  userId: string,
  creds: MicrosoftCredentials,
  config: MicrosoftConfig,
  workbookId: string,
  rows: TaskRowValues[],
): Promise<number> {
  if (rows.length === 0) return 0;
  const token = await accessTokenFor(userId, creds, config);
  const table = await ensureTable(token, workbookId);

  const added = new Date().toISOString().slice(0, 10);
  const values = rows.map((r) => [r.meeting, r.recorded, r.task, r.owner, r.due, r.priority, r.blockedBy, added]);

  await graph(token, `/me/drive/items/${workbookId}/workbook/tables/${table.id}/rows/add`, {
    method: "POST",
    body: { values },
  });
  return rows.length;
}

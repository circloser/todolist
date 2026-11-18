import { getD1 } from "../../db";
import {
  buildDeadlineDigest,
  webhookBody,
  type AlertItem,
} from "../lib/deadline-alerts";
import { kstToday } from "../lib/team";

// Sends the 마감 알림 digest for a board. Used by the 🔔 panel's
// "웹훅으로 발송" button and by the weekday cron (worker/index.ts), which
// calls sendAllDeadlineAlerts() directly — no HTTP round trip, so it does
// not need a signed-in user.

export type AlertResult =
  | { status: "disabled" }
  | { status: "nothing" }
  | { status: "sent"; sent: number }
  | { status: "failed"; error: string };

export const AUTO_ALERT_ACTOR = "자동 알림";

async function loadAlertItems(workspaceId: string): Promise<AlertItem[]> {
  const d1 = getD1();
  const [items, steps] = await Promise.all([
    d1
      .prepare("SELECT id, title, assignee, due_date FROM workflow_items WHERE workspace_id = ?")
      .bind(workspaceId)
      .all<{ id: number; title: string; assignee: string; due_date: string | null }>(),
    d1
      .prepare(
        `SELECT s.item_id, s.title, s.status, s.due_date, s.position
         FROM workflow_steps s JOIN workflow_items i ON i.id = s.item_id
         WHERE i.workspace_id = ?`
      )
      .bind(workspaceId)
      .all<{ item_id: number; title: string; status: string; due_date: string | null; position: number }>(),
  ]);
  const byItem = new Map<number, AlertItem["steps"]>();

  for (const step of steps.results ?? []) {
    byItem.set(step.item_id, [
      ...(byItem.get(step.item_id) ?? []),
      { title: step.title, status: step.status, dueDate: step.due_date, position: step.position },
    ]);
  }

  return (items.results ?? []).map((item) => ({
    title: item.title,
    assignee: item.assignee,
    dueDate: item.due_date,
    steps: byItem.get(item.id) ?? [],
  }));
}

async function organizationName(workspaceId: string) {
  const row = await getD1()
    .prepare(
      `SELECT COALESCE(
         (SELECT value FROM workspace_settings WHERE workspace_id = ? AND key = 'organizationName'),
         (SELECT TRIM(department_name || ' ' || team_name) FROM workspaces WHERE id = ?)
       ) AS name`
    )
    .bind(workspaceId, workspaceId)
    .first<{ name: string | null }>();
  return row?.name?.trim() || "팀";
}

async function logAlertHistory(workspaceId: string, summary: string, actor: string, action: string) {
  try {
    await getD1()
      .prepare(
        `INSERT INTO workflow_history (workspace_id, item_id, entity_type, entity_id, action, summary, actor, created_at)
         VALUES (?, NULL, 'notification', NULL, ?, ?, ?, ?)`
      )
      .bind(workspaceId, action, summary, actor, new Date().toISOString())
      .run();
  } catch {
    // history is best-effort
  }
}

export async function getWebhook(workspaceId: string) {
  try {
    const row = await getD1()
      .prepare("SELECT url, enabled FROM webhook_settings WHERE workspace_id = ? ORDER BY id LIMIT 1")
      .bind(workspaceId)
      .first<{ url: string; enabled: number }>();
    return row ? { url: row.url, enabled: row.enabled === 1 } : { url: "", enabled: false };
  } catch {
    return { url: "", enabled: false };
  }
}

export async function sendDeadlineAlerts(
  workspaceId: string,
  actor: string,
  today = kstToday()
): Promise<AlertResult> {
  const webhook = await getWebhook(workspaceId);

  if (!webhook.url || !webhook.enabled) {
    return { status: "disabled" };
  }

  const digest = buildDeadlineDigest(
    await loadAlertItems(workspaceId),
    await organizationName(workspaceId),
    today
  );

  if (!digest.total) {
    return { status: "nothing" };
  }

  const prefix = actor === AUTO_ALERT_ACTOR ? "평일 자동 발송: " : `${actor}님이 `;

  try {
    const response = await fetch(webhook.url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(webhookBody(webhook.url, digest.text)),
    });

    if (!response.ok) {
      const error = `웹훅 발송에 실패했습니다 (HTTP ${response.status}).`;
      await logAlertHistory(workspaceId, `${prefix}마감 알림 발송 실패 — HTTP ${response.status}`, actor, "send-failed");
      return { status: "failed", error };
    }
  } catch (sendError) {
    const reason = sendError instanceof Error ? sendError.message : String(sendError);
    await logAlertHistory(workspaceId, `${prefix}마감 알림 발송 실패 — ${reason.slice(0, 120)}`, actor, "send-failed");
    return { status: "failed", error: "웹훅 주소에 연결하지 못했습니다." };
  }

  await logAlertHistory(
    workspaceId,
    actor === AUTO_ALERT_ACTOR
      ? `평일 자동 발송: 마감 알림 ${digest.total}건을 웹훅으로 보냄`
      : `${actor}님이 마감 알림 ${digest.total}건을 웹훅으로 발송함`,
    actor,
    "send"
  );
  return { status: "sent", sent: digest.total };
}

/** Cron entry point: every board whose webhook is switched on. */
export async function sendAllDeadlineAlerts(today = kstToday()) {
  let workspaceIds: string[] = [];

  try {
    const rows = await getD1()
      .prepare(
        "SELECT DISTINCT workspace_id FROM webhook_settings WHERE enabled = 1 AND TRIM(url) <> ''"
      )
      .all<{ workspace_id: string }>();
    workspaceIds = (rows.results ?? []).map((row) => row.workspace_id);
  } catch {
    return [];
  }

  const results: Array<{ workspaceId: string } & AlertResult> = [];
  for (const workspaceId of workspaceIds) {
    try {
      results.push({ workspaceId, ...(await sendDeadlineAlerts(workspaceId, AUTO_ALERT_ACTOR, today)) });
    } catch (error) {
      results.push({
        workspaceId,
        status: "failed",
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
  return results;
}

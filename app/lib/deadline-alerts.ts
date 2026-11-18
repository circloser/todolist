// 마감 알림: build the Slack/Discord digest of overdue and soon-due work.
// Pure so it can be unit-tested; app/api/deadline-alerts.ts loads the data
// and sends it (from the 🔔 panel and from the weekday cron).

import { daysBetween } from "./team";

export const ALERT_WINDOW_DAYS = 3;

export type AlertStep = {
  title: string;
  status: string;
  dueDate: string | null;
  position: number;
};

export type AlertItem = {
  title: string;
  assignee: string;
  dueDate: string | null;
  steps: AlertStep[];
};

export type DeadlineDigest = {
  total: number;
  overdue: number;
  urgent: number;
  text: string;
};

type Entry = { label: string; date: string; days: number };

function badge(days: number) {
  return days < 0 ? `🔴 D+${Math.abs(days)}` : days <= 1 ? `🟠 D-${days}` : `🟡 D-${days}`;
}

export function buildDeadlineDigest(
  items: AlertItem[],
  organizationName: string,
  today: string
): DeadlineDigest {
  const groups = new Map<string, Entry[]>();
  let overdue = 0;
  let urgent = 0;

  for (const item of items) {
    const steps = [...item.steps].sort((first, second) => first.position - second.position);
    if (steps.length > 0 && steps.every((step) => step.status === "done")) {
      continue;
    }

    const entries: Entry[] = [];
    const next = steps.find((step) => step.status !== "done");

    if (next?.dueDate) {
      const days = daysBetween(today, next.dueDate);
      if (days <= ALERT_WINDOW_DAYS) {
        entries.push({ label: `${item.title} — ${next.title}`, date: next.dueDate, days });
      }
    }

    if (item.dueDate) {
      const days = daysBetween(today, item.dueDate);
      if (days <= ALERT_WINDOW_DAYS) {
        entries.push({ label: `${item.title} — 최종 마감`, date: item.dueDate, days });
      }
    }

    if (entries.length) {
      const who = item.assignee.trim() || "미지정";
      groups.set(who, [...(groups.get(who) ?? []), ...entries]);
      for (const entry of entries) {
        if (entry.days < 0) {
          overdue += 1;
        } else {
          urgent += 1;
        }
      }
    }
  }

  const lines = [
    `📋 [${organizationName}] 마감 알림 (${today})`,
    `🔴 지연 ${overdue}건 · 🟡 임박(D-${ALERT_WINDOW_DAYS} 이내) ${urgent}건`,
    "",
  ];

  for (const [assignee, entries] of groups) {
    lines.push(`■ ${assignee}`);
    for (const entry of [...entries].sort((first, second) => first.days - second.days)) {
      lines.push(`  · ${badge(entry.days)} ${entry.label} (${entry.date.slice(5).replace("-", ".")})`);
    }
  }

  return { total: overdue + urgent, overdue, urgent, text: lines.join("\n") };
}

/** Slack expects { text }, Discord { content }. */
export function webhookBody(url: string, text: string) {
  return url.includes("discord.com/api/webhooks") || url.includes("discordapp.com/api/webhooks")
    ? { content: text }
    : { text };
}

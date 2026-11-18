import { describe, expect, it } from "vitest";
import { buildDeadlineDigest, webhookBody, type AlertItem } from "./deadline-alerts";

const step = (title: string, status: string, dueDate: string | null, position: number) => ({
  title,
  status,
  dueDate,
  position,
});

const items: AlertItem[] = [
  {
    title: "습지 조사",
    assignee: "김민지",
    dueDate: "2026-11-30",
    steps: [step("견적", "done", "2026-11-10", 2), step("계약", "todo", "2026-11-17", 3), step("계획", "done", null, 1)],
  },
  { title: "탐방로 정비", assignee: " ", dueDate: "2026-11-20", steps: [] },
  {
    title: "끝난 업무",
    assignee: "박서준",
    dueDate: "2026-11-01",
    steps: [step("결과 보고", "done", "2026-11-01", 1)],
  },
  { title: "여유 있는 업무", assignee: "박서준", dueDate: "2026-12-31", steps: [] },
];

describe("buildDeadlineDigest", () => {
  it("lists the next open step and final due dates within three days", () => {
    const digest = buildDeadlineDigest(items, "습지복원팀", "2026-11-18");
    expect(digest).toMatchObject({ total: 2, overdue: 1, urgent: 1 });
    expect(digest.text.split("\n")).toEqual([
      "📋 [습지복원팀] 마감 알림 (2026-11-18)",
      "🔴 지연 1건 · 🟡 임박(D-3 이내) 1건",
      "",
      "■ 김민지",
      "  · 🔴 D+1 습지 조사 — 계약 (11.17)",
      "■ 미지정",
      "  · 🟡 D-2 탐방로 정비 — 최종 마감 (11.20)",
    ]);
  });

  it("skips finished items and reports nothing when all is calm", () => {
    expect(buildDeadlineDigest(items.slice(2), "팀", "2026-11-18").total).toBe(0);
  });

  it("formats bodies for Slack and Discord", () => {
    expect(webhookBody("https://hooks.slack.com/services/x", "hi")).toEqual({ text: "hi" });
    expect(webhookBody("https://discord.com/api/webhooks/1/abc", "hi")).toEqual({ content: "hi" });
  });
});

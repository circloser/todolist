import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// A tiny in-memory stand-in for the D1 queries this module makes.
type Board = {
  webhook?: { url: string; enabled: number };
  items: Array<{ id: number; title: string; assignee: string; due_date: string | null }>;
  steps: Array<{ item_id: number; title: string; status: string; due_date: string | null; position: number }>;
};
const boards = new Map<string, Board>();
const history: Array<{ workspaceId: string; action: string; summary: string; actor: string }> = [];

function statement(sql: string, args: unknown[] = []) {
  const workspaceId = String(args[0]);
  return {
    bind: (...values: unknown[]) => statement(sql, values),
    async all() {
      if (sql.includes("SELECT DISTINCT workspace_id FROM webhook_settings")) {
        return {
          results: [...boards.entries()]
            .filter(([, board]) => board.webhook?.enabled && board.webhook.url.trim())
            .map(([id]) => ({ workspace_id: id })),
        };
      }
      if (sql.includes("FROM workflow_items WHERE")) {
        return { results: boards.get(workspaceId)?.items ?? [] };
      }
      if (sql.includes("FROM workflow_steps")) {
        return { results: boards.get(workspaceId)?.steps ?? [] };
      }
      throw new Error(`unexpected all(): ${sql}`);
    },
    async first() {
      if (sql.includes("FROM webhook_settings")) {
        return boards.get(workspaceId)?.webhook ?? null;
      }
      if (sql.includes("organizationName")) {
        return { name: "습지복원팀" };
      }
      throw new Error(`unexpected first(): ${sql}`);
    },
    async run() {
      if (sql.includes("INSERT INTO workflow_history")) {
        const [id, action, summary, actor] = args as string[];
        history.push({ workspaceId: id, action, summary, actor });
      }
      return { meta: {} };
    },
  };
}

vi.mock("../../db", () => ({ getD1: () => ({ prepare: (sql: string) => statement(sql) }) }));

const { sendAllDeadlineAlerts, sendDeadlineAlerts, AUTO_ALERT_ACTOR } = await import("./deadline-alerts");

const overdueBoard = (url: string, enabled = 1): Board => ({
  webhook: { url, enabled },
  items: [{ id: 1, title: "습지 조사", assignee: "김민지", due_date: "2026-11-17" }],
  steps: [],
});

describe("deadline alerts", () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    boards.clear();
    history.length = 0;
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
  });
  afterEach(() => vi.unstubAllGlobals());

  it("does nothing for boards without an enabled webhook", async () => {
    boards.set("a", overdueBoard("https://hooks.slack.com/x", 0));
    expect(await sendDeadlineAlerts("a", "최부장", "2026-11-18")).toEqual({ status: "disabled" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("posts the digest and records who sent it", async () => {
    boards.set("a", overdueBoard("https://hooks.slack.com/x"));
    fetchMock.mockResolvedValue(new Response("ok", { status: 200 }));

    expect(await sendDeadlineAlerts("a", "최부장", "2026-11-18")).toEqual({ status: "sent", sent: 1 });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://hooks.slack.com/x");
    expect(JSON.parse(init.body).text).toContain("🔴 D+1 습지 조사 — 최종 마감");
    expect(history).toEqual([
      { workspaceId: "a", action: "send", summary: "최부장님이 마감 알림 1건을 웹훅으로 발송함", actor: "최부장" },
    ]);
  });

  it("records failed deliveries in the board history", async () => {
    boards.set("a", overdueBoard("https://hooks.slack.com/x"));
    fetchMock.mockResolvedValue(new Response("nope", { status: 404 }));
    expect(await sendDeadlineAlerts("a", AUTO_ALERT_ACTOR, "2026-11-18")).toMatchObject({ status: "failed" });

    fetchMock.mockRejectedValue(new Error("connection refused"));
    expect(await sendDeadlineAlerts("a", AUTO_ALERT_ACTOR, "2026-11-18")).toMatchObject({ status: "failed" });
    expect(history.map((entry) => entry.summary)).toEqual([
      "평일 자동 발송: 마감 알림 발송 실패 — HTTP 404",
      "평일 자동 발송: 마감 알림 발송 실패 — connection refused",
    ]);
  });

  it("cron sends for every enabled board and skips quiet ones", async () => {
    boards.set("2026", overdueBoard("https://hooks.slack.com/a"));
    boards.set("2027", overdueBoard("https://discord.com/api/webhooks/1/b"));
    boards.set("off", overdueBoard("https://hooks.slack.com/c", 0));
    boards.set("quiet", { webhook: { url: "https://hooks.slack.com/d", enabled: 1 }, items: [], steps: [] });
    fetchMock.mockResolvedValue(new Response("ok", { status: 200 }));

    const results = await sendAllDeadlineAlerts("2026-11-18");
    expect(results.map((result) => `${result.workspaceId}:${result.status}`).sort()).toEqual([
      "2026:sent",
      "2027:sent",
      "quiet:nothing",
    ]);
    const discord = fetchMock.mock.calls.find(([url]) => String(url).includes("discord"));
    expect(JSON.parse(discord?.[1].body)).toHaveProperty("content");
    expect(history.every((entry) => entry.actor === "자동 알림")).toBe(true);
    expect(history[0].summary).toBe("평일 자동 발송: 마감 알림 1건을 웹훅으로 보냄");
  });
});

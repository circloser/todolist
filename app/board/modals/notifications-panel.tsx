"use client";

import {
  formatDay,
  rowAccentColor,
  shortDueLabel,
} from "../../lib/workflow";
import { useBoard } from "../board-context";

export default function NotificationsPanel() {
  const {
    assigneeSettings,
    setNotifOpen,
    webhookUrl,
    webhookEnabled,
    sendingAlerts,
    alertResult,
    notifications,
    sendDeadlineAlerts,
    openItem,
  } = useBoard();

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-auto bg-black/40 p-4 backdrop-blur-sm"
      onClick={() => setNotifOpen(false)}
    >
      <div
        className="tb-card my-6 w-full max-w-[520px] shadow-[var(--shadow-lg)]"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-[var(--border)] px-5 py-3.5">
          <h2 className="flex items-center gap-2 text-base font-semibold">
            마감 알림
            {notifications.total ? (
              <span className="tb-badge tb-badge-danger">
                {notifications.total}
              </span>
            ) : null}
          </h2>
          <button
            aria-label="닫기"
            type="button"
            onClick={() => setNotifOpen(false)}
            className="tb-iconbtn h-8 w-8"
          >
            ×
          </button>
        </div>

        <div className="max-h-[70vh] space-y-4 overflow-auto p-5">
          {notifications.list.length ? (
            notifications.list.map((group) => (
              <div key={group.assignee}>
                <div className="mb-1.5 flex items-center gap-2 text-sm font-semibold">
                  <span
                    className="h-2.5 w-2.5 rounded-full"
                    style={{
                      backgroundColor: rowAccentColor(
                        assigneeSettings[group.assignee]
                      ),
                    }}
                  />
                  {group.assignee}
                  <span className="ml-auto text-xs font-normal text-[var(--text-faint)]">
                    {group.overdue ? `지연 ${group.overdue} · ` : ""}
                    총 {group.entries.length}건
                  </span>
                </div>
                <div className="space-y-1.5">
                  {group.entries.map((entry, index) => (
                    <button
                      key={`${entry.itemId}-${index}`}
                      type="button"
                      onClick={() => {
                        openItem(entry.itemId);
                        setNotifOpen(false);
                      }}
                      className="flex w-full items-center gap-2.5 rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-left transition hover:border-[var(--accent)] hover:bg-[var(--surface-3)]"
                    >
                      <span
                        className={`tb-badge ${
                          entry.state === "overdue" || entry.state === "danger"
                            ? "tb-badge-danger"
                            : "tb-badge-warning"
                        }`}
                      >
                        {shortDueLabel(entry.date)}
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm font-medium">
                          {entry.title}
                        </div>
                        <div className="text-[11px] text-[var(--text-faint)]">
                          {entry.label} · {formatDay(entry.date)}
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            ))
          ) : (
            <div className="py-10 text-center text-sm text-[var(--text-muted)]">
              마감 임박·지연 항목이 없습니다. 👍
            </div>
          )}
        </div>

        <div className="flex items-center gap-2 border-t border-[var(--border)] px-5 py-3">
          <button
            type="button"
            disabled={
              !webhookUrl || !webhookEnabled || sendingAlerts ||
              !notifications.total
            }
            onClick={() => void sendDeadlineAlerts()}
            className="tb-btn tb-btn-primary"
            title={
              !webhookUrl || !webhookEnabled
                ? "보드 설정에서 웹훅을 먼저 저장하세요"
                : "담당자별 임박·지연 목록을 웹훅으로 발송"
            }
          >
            {sendingAlerts ? "발송 중…" : "웹훅으로 발송"}
          </button>
          <span className="min-w-0 flex-1 truncate text-xs text-[var(--text-muted)]">
            {alertResult ||
              (!webhookUrl || !webhookEnabled
                ? "보드 설정에서 Slack/Discord 웹훅을 등록하면 발송할 수 있습니다."
                : "")}
          </span>
        </div>
      </div>
    </div>
  );
}

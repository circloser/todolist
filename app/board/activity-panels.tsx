"use client";

import {
  formatDate,
} from "../lib/workflow";
import { useBoard } from "./board-context";

export default function ActivityPanels() {
  const {
    history,
    organizationName,
    setOrganizationName,
    boardTitle,
    setBoardTitle,
    workspaceDepartmentDraft,
    setWorkspaceDepartmentDraft,
    workspaceTeamDraft,
    setWorkspaceTeamDraft,
    workspacePasswordDraft,
    setWorkspacePasswordDraft,
    savingWorkspace,
    userName,
    setUserName,
    webhookUrl,
    setWebhookUrl,
    webhookEnabled,
    setWebhookEnabled,
    savingWebhook,
    saveUserName,
    saveWorkspaceSettings,
    saveBoardSettings,
    saveWebhook,
  } = useBoard();

  return (
    <div className="mt-5 grid gap-4 lg:grid-cols-[1fr_360px]">
      <section className="tb-card tb-section p-5">
        <h2 className="text-base font-semibold">변경 이력</h2>
        <div className="mt-3 max-h-64 space-y-3 overflow-auto">
          {history.slice(0, 20).map((entry) => (
            <div
              key={entry.id}
              className="border-l-2 border-[var(--accent-soft-2)] pl-3 text-sm leading-5 text-[var(--text-muted)]"
            >
              <div className="text-[11px] font-semibold text-[var(--text-faint)]">
                {formatDate(entry.createdAt)}
              </div>
              {entry.summary}
            </div>
          ))}
          {!history.length ? (
            <div className="text-sm text-[var(--text-faint)]">
              아직 변경 이력이 없습니다.
            </div>
          ) : null}
        </div>
      </section>

      <section className="tb-card tb-section p-5">
        <h2 className="text-base font-semibold">보드 설정</h2>
        <div className="mt-3 grid gap-3.5">
          <div className="grid gap-3 border-b border-[var(--border)] pb-3">
            <div>
              <span className="tb-label">현재 연도/조직</span>
              <div className="grid gap-2 sm:grid-cols-2">
                <input
                  value={workspaceDepartmentDraft}
                  onChange={(event) =>
                    setWorkspaceDepartmentDraft(event.target.value)
                  }
                  className="tb-field"
                  placeholder="연도"
                />
                <input
                  value={workspaceTeamDraft}
                  onChange={(event) => setWorkspaceTeamDraft(event.target.value)}
                  className="tb-field"
                  placeholder="조직/팀명"
                />
              </div>
            </div>
            <div className="grid gap-2 sm:grid-cols-[1fr_auto]">
              <input
                type="password"
                value={workspacePasswordDraft}
                onChange={(event) => setWorkspacePasswordDraft(event.target.value)}
                className="tb-field"
                placeholder="새 암호 (변경할 때만 입력)"
              />
              <button
                type="button"
                onClick={() => void saveWorkspaceSettings()}
                disabled={savingWorkspace}
                className="tb-btn tb-btn-primary"
              >
                {savingWorkspace ? "저장 중" : "연도/조직 저장"}
              </button>
            </div>
          </div>
          <label>
            <span className="tb-label">조직명</span>
            <input
              value={organizationName}
              onChange={(event) => setOrganizationName(event.target.value)}
              onBlur={(event) =>
                void saveBoardSettings({
                  organizationName: event.target.value,
                })
              }
              className="tb-field"
            />
          </label>
          <label>
            <span className="tb-label">보드명</span>
            <input
              value={boardTitle}
              onChange={(event) => setBoardTitle(event.target.value)}
              onBlur={(event) =>
                void saveBoardSettings({ boardTitle: event.target.value })
              }
              className="tb-field"
            />
          </label>
          <label>
            <span className="tb-label">사용자명</span>
            <input
              value={userName}
              onChange={(event) => setUserName(event.target.value)}
              onBlur={(event) => saveUserName(event.target.value)}
              className="tb-field"
              placeholder="이름"
            />
          </label>

          <div className="border-t border-[var(--border)] pt-3">
            <span className="tb-label">
              알림 웹훅 (Slack / Discord){savingWebhook ? " · 저장 중…" : ""}
            </span>
            <input
              value={webhookUrl}
              onChange={(event) => setWebhookUrl(event.target.value)}
              onBlur={(event) =>
                void saveWebhook(event.target.value, webhookEnabled)
              }
              className="tb-field"
              placeholder="https://hooks.slack.com/services/… 또는 Discord 웹훅 URL"
            />
            <label className="mt-2 flex cursor-pointer items-center gap-2 text-sm text-[var(--text-muted)]">
              <input
                type="checkbox"
                checked={webhookEnabled}
                onChange={(event) => {
                  setWebhookEnabled(event.target.checked);
                  void saveWebhook(webhookUrl, event.target.checked);
                }}
                className="h-4 w-4 accent-[var(--accent)]"
              />
              발송 활성화
            </label>
            <p className="mt-1.5 text-[11px] leading-4 text-[var(--text-faint)]">
              알림(🔔) 패널의 &lsquo;웹훅으로 발송&rsquo; 버튼으로 즉시 보낼
              수 있고, 활성화 상태면 평일 오전 9시에 임박·지연 목록이 자동
              발송됩니다.
            </p>
          </div>
        </div>
      </section>
    </div>
  );
}

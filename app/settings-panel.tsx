"use client";

import { useEffect, useState, type ReactNode } from "react";

import type { MembersResponse, TeamMember, TeamPolicy } from "./lib/team";
import PolicyEditor from "./policy-editor";

// 설정 (부서장): one place for 보드 설정, 알림 웹훅 and 운영 옵션. The board and
// webhook fields stay owned by the board (their state and saving live there)
// and come in as content; 운영 옵션 is saved here.

type ApiRequest = (path: string, init?: RequestInit) => Promise<Response>;
export type SettingsTab = "board" | "webhook" | "options";

const TABS: Array<[SettingsTab, string]> = [
  ["board", "보드"],
  ["webhook", "알림 웹훅"],
  ["options", "운영 옵션"],
];

type SettingsPanelProps = {
  tab: SettingsTab;
  onTabChange: (tab: SettingsTab) => void;
  onClose: () => void;
  boardContent: ReactNode;
  webhookContent: ReactNode;
  policy: TeamPolicy;
  members: TeamMember[];
  request: ApiRequest;
  onMembersChange: (data: MembersResponse) => void;
};

export default function SettingsPanel({
  tab,
  onTabChange,
  onClose,
  boardContent,
  webhookContent,
  policy,
  members,
  request,
  onMembersChange,
}: SettingsPanelProps) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  async function send(body: Record<string, unknown>, success: string) {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const response = await request("/api/members", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = (await response.json()) as MembersResponse;
      if (!response.ok) {
        throw new Error(data.error ?? "설정을 저장하지 못했습니다.");
      }
      onMembersChange(data);
      setNotice(success);
      return true;
    } catch (sendError) {
      setError(sendError instanceof Error ? sendError.message : "설정을 저장하지 못했습니다.");
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function changePolicy(patch: Partial<TeamPolicy>) {
    // Show the change right away; put the old value back if saving fails.
    const previous = policy;
    onMembersChange({ policy: { ...policy, ...patch } });
    if (!(await send({ action: "update-policy", policy: patch }, "운영 옵션을 저장했습니다."))) {
      onMembersChange({ policy: previous });
    }
  }

  async function toggleViewer(member: TeamMember, value: boolean) {
    const previous = members;
    onMembersChange({
      members: members.map((entry) => (entry.id === member.id ? { ...entry, logViewer: value } : entry)),
    });
    if (
      !(await send(
        { id: member.id, logViewer: value },
        `${member.name}님의 전체 일지 열람을 ${value ? "허용" : "해제"}했습니다.`
      ))
    ) {
      onMembersChange({ members: previous });
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-auto bg-black/40 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="settings-title"
        className="tb-card my-6 w-full max-w-[640px] !bg-[var(--surface)] shadow-[var(--shadow-lg)]"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex flex-wrap items-center gap-2 border-b border-[var(--border)] px-5 py-3.5">
          <h2 id="settings-title" className="mr-auto text-base font-semibold">
            ⚙️ 설정
          </h2>
          <div className="tb-seg" role="tablist" aria-label="설정 항목">
            {TABS.map(([key, label]) => (
              <button
                key={key}
                type="button"
                role="tab"
                aria-selected={tab === key}
                data-active={tab === key}
                onClick={() => {
                  setError("");
                  setNotice("");
                  onTabChange(key);
                }}
                className="tb-seg-btn"
              >
                {label}
              </button>
            ))}
          </div>
          <button type="button" onClick={onClose} className="tb-iconbtn h-8 w-8" aria-label="닫기">
            ×
          </button>
        </div>

        <div className="max-h-[76vh] space-y-4 overflow-auto p-5">
          {error ? (
            <div
              role="alert"
              className="rounded-[var(--radius)] border border-[var(--danger-border)] bg-[var(--danger-soft)] px-3 py-2 text-sm text-[var(--danger)]"
            >
              {error}
            </div>
          ) : notice ? (
            <div
              role="status"
              className="rounded-[var(--radius)] border border-[var(--success-border)] bg-[var(--success-soft)] px-3 py-2 text-sm text-[var(--success)]"
            >
              {notice}
            </div>
          ) : null}

          {tab === "board" ? boardContent : null}
          {tab === "webhook" ? webhookContent : null}
          {tab === "options" ? (
            <PolicyEditor
              policy={policy}
              members={members}
              busy={busy}
              onChange={(patch) => void changePolicy(patch)}
              onToggleViewer={(member, value) => void toggleViewer(member, value)}
            />
          ) : null}
        </div>
      </div>
    </div>
  );
}

"use client";

import { FormEvent, useMemo, useState } from "react";

import {
  MEMBER_COLORS,
  pickMemberColor,
  unregisteredAssignees,
  type MembersResponse,
  type TeamMember,
} from "./lib/team";

type ApiRequest = (path: string, init?: RequestInit) => Promise<Response>;

type MembersPanelProps = {
  members: TeamMember[];
  boardAssignees: string[];
  currentActor: string;
  request: ApiRequest;
  onMembersChange: (data: MembersResponse) => void;
  onAssignmentsRenamed: () => void;
  onSetMe: (name: string) => void;
  onOpenWorkLog: () => void;
  onClose: () => void;
};

export default function MembersPanel({
  members,
  boardAssignees,
  currentActor,
  request,
  onMembersChange,
  onAssignmentsRenamed,
  onSetMe,
  onOpenWorkLog,
  onClose,
}: MembersPanelProps) {
  const [name, setName] = useState("");
  const [role, setRole] = useState("");
  const [color, setColor] = useState(() => pickMemberColor(members.length));
  const [drafts, setDrafts] = useState<Record<number, { name: string; role: string }>>({});
  const [showInactive, setShowInactive] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const pending = useMemo(
    () => unregisteredAssignees(members, boardAssignees),
    [members, boardAssignees]
  );
  const inactiveCount = members.filter((member) => !member.active).length;
  const visible = members.filter((member) => showInactive || member.active);

  async function send(init: RequestInit, successNotice?: (data: MembersResponse) => string) {
    setBusy(true);
    setError("");
    setNotice("");

    try {
      const response = await request("/api/members", {
        ...init,
        headers: { "Content-Type": "application/json" },
      });
      const data = (await response.json()) as MembersResponse;

      if (!response.ok) {
        throw new Error(data.error ?? "구성원 정보를 저장하지 못했습니다.");
      }

      onMembersChange(data);
      setNotice(successNotice?.(data) ?? "");
      return data;
    } catch (sendError) {
      setError(
        sendError instanceof Error
          ? sendError.message
          : "구성원 정보를 저장하지 못했습니다."
      );
      return null;
    } finally {
      setBusy(false);
    }
  }

  async function addMember(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!name.trim()) {
      setError("구성원 이름을 입력해 주세요.");
      return;
    }

    const data = await send(
      {
        method: "POST",
        body: JSON.stringify({ name, role, color, actor: currentActor }),
      },
      () => `'${name.trim()}' 구성원을 등록했습니다.`
    );

    if (data) {
      setName("");
      setRole("");
      setColor(pickMemberColor((data.members ?? members).length));
    }
  }

  async function importAssignees() {
    await send(
      {
        method: "POST",
        body: JSON.stringify({ action: "import-assignees", actor: currentActor }),
      },
      (data) => `담당자 ${data.imported ?? 0}명을 구성원으로 등록했습니다.`
    );
  }

  async function updateMember(
    member: TeamMember,
    patch: Partial<Pick<TeamMember, "name" | "role" | "color" | "active">>
  ) {
    const renamed = patch.name !== undefined && patch.name.trim() !== member.name;
    const data = await send(
      {
        method: "PATCH",
        body: JSON.stringify({ id: member.id, actor: currentActor, ...patch }),
      },
      (result) =>
        renamed
          ? `이름을 변경했습니다.${
              result.renamedItems
                ? ` 담당 업무 ${result.renamedItems}건에도 반영했습니다.`
                : ""
            }`
          : ""
    );

    if (data) {
      setDrafts((current) => {
        const next = { ...current };
        delete next[member.id];
        return next;
      });

      if (renamed) {
        if (data.renamedItems) {
          onAssignmentsRenamed();
        }
        if (member.name === currentActor && patch.name) {
          onSetMe(patch.name.trim());
        }
      }
    } else {
      // Revert the inline draft to what the server still has.
      setDrafts((current) => {
        const next = { ...current };
        delete next[member.id];
        return next;
      });
    }
  }

  async function moveMember(member: TeamMember, direction: -1 | 1) {
    const order = members.map((entry) => entry.id);
    const index = order.indexOf(member.id);
    const target = index + direction;

    if (index < 0 || target < 0 || target >= order.length) {
      return;
    }

    [order[index], order[target]] = [order[target], order[index]];
    await send({
      method: "PATCH",
      body: JSON.stringify({ action: "reorder", order, actor: currentActor }),
    });
  }

  async function deleteMember(member: TeamMember) {
    if (!window.confirm(`'${member.name}' 구성원을 삭제할까요?`)) {
      return;
    }

    await send(
      {
        method: "DELETE",
        body: JSON.stringify({ id: member.id, actor: currentActor }),
      },
      () => `'${member.name}' 구성원을 삭제했습니다.`
    );
  }

  function draftOf(member: TeamMember) {
    return drafts[member.id] ?? { name: member.name, role: member.role };
  }

  function setDraft(member: TeamMember, patch: Partial<{ name: string; role: string }>) {
    setDrafts((current) => ({
      ...current,
      [member.id]: { ...draftOf(member), ...patch },
    }));
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-auto bg-black/40 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="tb-card my-6 w-full max-w-[760px] shadow-[var(--shadow-lg)]"
        onClick={(event) => event.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="members-title"
      >
        <div className="flex flex-wrap items-center gap-2 border-b border-[var(--border)] px-5 py-3.5">
          <div className="min-w-0 flex-1">
            <h2 id="members-title" className="text-base font-semibold">
              👥 구성원 관리
            </h2>
            <p className="mt-0.5 text-xs text-[var(--text-muted)]">
              등록한 구성원은 담당자 목록과 업무일지 작성자로 함께 쓰입니다.
            </p>
          </div>
          <button
            type="button"
            onClick={onOpenWorkLog}
            className="tb-btn text-sm"
            disabled={!members.length}
          >
            📝 업무일지
          </button>
          <button
            type="button"
            onClick={onClose}
            className="tb-iconbtn h-8 w-8"
            aria-label="닫기"
          >
            ×
          </button>
        </div>

        <div className="space-y-4 p-5">
          <form
            onSubmit={addMember}
            className="grid gap-2 sm:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)_auto_auto]"
          >
            <input
              value={name}
              onChange={(event) => setName(event.target.value)}
              className="tb-field"
              placeholder="이름"
              aria-label="새 구성원 이름"
              maxLength={40}
            />
            <input
              value={role}
              onChange={(event) => setRole(event.target.value)}
              className="tb-field"
              placeholder="역할·직급 (선택)"
              aria-label="새 구성원 역할"
              maxLength={40}
            />
            <ColorPicker value={color} onChange={setColor} label="새 구성원 색상" />
            <button type="submit" disabled={busy} className="tb-btn tb-btn-primary">
              구성원 추가
            </button>
          </form>

          {pending.length ? (
            <div className="flex flex-wrap items-center gap-2 rounded-[var(--radius)] border border-[var(--warning-border)] bg-[var(--warning-soft)] px-3 py-2.5 text-sm">
              <span className="min-w-0 flex-1">
                보드에서 담당자로 쓰는 이름 {pending.length}명이 아직 구성원이
                아닙니다:{" "}
                <span className="font-medium">
                  {pending.slice(0, 6).join(", ")}
                  {pending.length > 6 ? ` 외 ${pending.length - 6}명` : ""}
                </span>
              </span>
              <button
                type="button"
                onClick={() => void importAssignees()}
                disabled={busy}
                className="tb-btn shrink-0 text-sm"
              >
                한 번에 등록
              </button>
            </div>
          ) : null}

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

          <div className="flex items-center justify-between text-xs text-[var(--text-muted)]">
            <span>
              활성 {members.length - inactiveCount}명
              {inactiveCount ? ` · 비활성 ${inactiveCount}명` : ""}
            </span>
            {inactiveCount ? (
              <label className="flex cursor-pointer items-center gap-1.5">
                <input
                  type="checkbox"
                  checked={showInactive}
                  onChange={(event) => setShowInactive(event.target.checked)}
                  className="h-3.5 w-3.5 accent-[var(--accent)]"
                />
                비활성 구성원 표시
              </label>
            ) : null}
          </div>

          <ul className="space-y-2" aria-label="구성원 목록">
            {visible.length ? (
              visible.map((member) => {
                const draft = draftOf(member);
                const index = members.findIndex((entry) => entry.id === member.id);
                const isMe = member.name === currentActor;

                return (
                  <li
                    key={member.id}
                    className={`flex flex-wrap items-center gap-2 rounded-[var(--radius)] border border-[var(--border)] px-3 py-2 ${
                      member.active ? "bg-[var(--surface)]" : "bg-[var(--surface-2)] opacity-70"
                    }`}
                  >
                    <ColorPicker
                      value={member.color}
                      onChange={(value) => void updateMember(member, { color: value })}
                      label={`${member.name} 색상`}
                    />
                    <input
                      value={draft.name}
                      onChange={(event) => setDraft(member, { name: event.target.value })}
                      onBlur={() => {
                        if (draft.name.trim() && draft.name.trim() !== member.name) {
                          void updateMember(member, { name: draft.name });
                        } else {
                          setDraft(member, { name: member.name });
                        }
                      }}
                      onKeyDown={(event) => {
                        if (event.key === "Enter") {
                          event.currentTarget.blur();
                        }
                      }}
                      className="tb-field min-w-[120px] flex-1 !py-1.5 font-medium"
                      aria-label="이름"
                      maxLength={40}
                    />
                    <input
                      value={draft.role}
                      onChange={(event) => setDraft(member, { role: event.target.value })}
                      onBlur={() => {
                        if (draft.role.trim() !== member.role) {
                          void updateMember(member, { role: draft.role });
                        }
                      }}
                      onKeyDown={(event) => {
                        if (event.key === "Enter") {
                          event.currentTarget.blur();
                        }
                      }}
                      className="tb-field min-w-[100px] flex-1 !py-1.5"
                      placeholder="역할·직급"
                      aria-label="역할"
                      maxLength={40}
                    />
                    <div className="flex items-center gap-1">
                      {isMe ? (
                        <span className="tb-badge tb-badge-success">나</span>
                      ) : member.active ? (
                        <button
                          type="button"
                          onClick={() => onSetMe(member.name)}
                          className="tb-btn !px-2 !py-1 text-xs"
                          title="이 브라우저의 사용자명을 이 구성원으로 설정"
                        >
                          나로 설정
                        </button>
                      ) : null}
                      <button
                        type="button"
                        onClick={() => void updateMember(member, { active: !member.active })}
                        disabled={busy}
                        className="tb-btn !px-2 !py-1 text-xs"
                        title={member.active ? "퇴사·휴직 등으로 목록에서 숨김" : "다시 활성화"}
                      >
                        {member.active ? "비활성화" : "활성화"}
                      </button>
                      <button
                        type="button"
                        onClick={() => void moveMember(member, -1)}
                        disabled={busy || index <= 0}
                        className="tb-iconbtn h-7 w-7"
                        aria-label={`${member.name} 위로`}
                      >
                        ▲
                      </button>
                      <button
                        type="button"
                        onClick={() => void moveMember(member, 1)}
                        disabled={busy || index >= members.length - 1}
                        className="tb-iconbtn h-7 w-7"
                        aria-label={`${member.name} 아래로`}
                      >
                        ▼
                      </button>
                      <button
                        type="button"
                        onClick={() => void deleteMember(member)}
                        disabled={busy}
                        className="tb-iconbtn tb-iconbtn-danger h-7 w-7"
                        aria-label={`${member.name} 삭제`}
                      >
                        ×
                      </button>
                    </div>
                  </li>
                );
              })
            ) : (
              <li className="py-8 text-center text-sm text-[var(--text-muted)]">
                {members.length
                  ? "활성 구성원이 없습니다."
                  : "등록된 구성원이 없습니다. 위에서 팀원을 추가해 보세요."}
              </li>
            )}
          </ul>
          <p className="text-[11px] leading-4 text-[var(--text-faint)]">
            이름을 바꾸면 그 이름으로 지정된 업무의 담당자명과 업무일지에도 함께
            반영됩니다. 업무일지가 있는 구성원은 삭제 대신 비활성화해 주세요.
          </p>
        </div>
      </div>
    </div>
  );
}

function ColorPicker({
  value,
  onChange,
  label,
}: {
  value: string;
  onChange: (value: string) => void;
  label: string;
}) {
  const [open, setOpen] = useState(false);

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        className="h-8 w-8 rounded-[var(--radius)] border border-[var(--border-strong)]"
        style={{ background: value }}
        aria-label={label}
        aria-expanded={open}
      />
      {open ? (
        <div className="absolute left-0 top-9 z-10 grid w-[148px] grid-cols-4 gap-1.5 rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface)] p-2 shadow-[var(--shadow-md)]">
          {MEMBER_COLORS.map((swatch) => (
            <button
              key={swatch}
              type="button"
              onClick={() => {
                onChange(swatch);
                setOpen(false);
              }}
              className="h-7 w-7 rounded-[var(--radius-sm)] border"
              style={{
                background: swatch,
                borderColor: swatch === value ? "var(--accent)" : "var(--border)",
              }}
              aria-label={swatch}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}

"use client";

import { FormEvent, useMemo, useState } from "react";

import PolicyEditor from "./policy-editor";
import {
  MEMBER_COLORS,
  pickMemberColor,
  unregisteredAssignees,
  type AccessRole,
  type JoinRequest,
  type MembersResponse,
  type TeamMember,
  type TeamPolicy,
  type Viewer,
} from "./lib/team";

type ApiRequest = (path: string, init?: RequestInit) => Promise<Response>;

type MembersPanelProps = {
  viewer: Viewer | null;
  members: TeamMember[];
  requests: JoinRequest[];
  policy: TeamPolicy;
  boardAssignees: string[];
  request: ApiRequest;
  onMembersChange: (data: MembersResponse) => void;
  onAssignmentsRenamed: () => void;
  onOpenWorkLog: () => void;
  onClose: () => void;
};

function formatDate(iso: string) {
  const date = new Date(iso);
  return Number.isNaN(date.getTime())
    ? ""
    : date.toLocaleDateString("ko-KR", { month: "numeric", day: "numeric" });
}

function RoleBadge({ member }: { member: TeamMember }) {
  if (!member.hasAccount) {
    return (
      <span className="tb-badge tb-badge-muted" title="로그인 계정이 연결되지 않은 구성원">
        계정 없음
      </span>
    );
  }
  return member.accessRole === "manager" ? (
    <span className="tb-badge tb-badge-complete">부서장</span>
  ) : (
    <span className="tb-badge tb-badge-muted">구성원</span>
  );
}

export default function MembersPanel({
  viewer,
  members,
  requests,
  policy,
  boardAssignees,
  request,
  onMembersChange,
  onAssignmentsRenamed,
  onOpenWorkLog,
  onClose,
}: MembersPanelProps) {
  const isManager = viewer?.accessRole === "manager";
  const [tab, setTab] = useState<"members" | "options">("members");
  const [name, setName] = useState("");
  const [role, setRole] = useState("");
  const [color, setColor] = useState(() => pickMemberColor(members.length));
  const [drafts, setDrafts] = useState<Record<number, { name: string; role: string }>>({});
  const [approvals, setApprovals] = useState<
    Record<number, { memberId: number | 0; accessRole: AccessRole }>
  >({});
  const [showInactive, setShowInactive] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const pending = useMemo(
    () => (isManager ? unregisteredAssignees(members, boardAssignees) : []),
    [isManager, members, boardAssignees]
  );
  const linkable = members.filter((member) => !member.hasAccount);
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
      { method: "POST", body: JSON.stringify({ name, role, color }) },
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
      { method: "POST", body: JSON.stringify({ action: "import-assignees" }) },
      (data) => `담당자 ${data.imported ?? 0}명을 구성원으로 등록했습니다.`
    );
  }

  function approvalOf(joinRequest: JoinRequest) {
    return (
      approvals[joinRequest.id] ?? {
        memberId: joinRequest.suggestedMemberId ?? 0,
        accessRole: "member" as AccessRole,
      }
    );
  }

  async function decide(joinRequest: JoinRequest, approve: boolean) {
    if (!approve && !window.confirm(`${joinRequest.name}(@${joinRequest.loginId})님의 가입 신청을 거절할까요?`)) {
      return;
    }
    const choice = approvalOf(joinRequest);
    await send(
      {
        method: "POST",
        body: JSON.stringify({
          action: approve ? "approve-join" : "reject-join",
          requestId: joinRequest.id,
          memberId: choice.memberId || null,
          accessRole: choice.accessRole,
        }),
      },
      () =>
        approve
          ? `${joinRequest.name}님의 가입을 승인했습니다.`
          : `${joinRequest.name}님의 가입 신청을 거절했습니다.`
    );
  }

  function clearDraft(member: TeamMember) {
    setDrafts((current) => {
      const next = { ...current };
      delete next[member.id];
      return next;
    });
  }

  async function updateMember(
    member: TeamMember,
    patch: Partial<Pick<TeamMember, "name" | "role" | "color" | "active" | "accessRole" | "logViewer">>
  ) {
    const renamed = patch.name !== undefined && patch.name.trim() !== member.name;
    const data = await send(
      { method: "PATCH", body: JSON.stringify({ id: member.id, ...patch }) },
      (result) =>
        renamed
          ? `이름을 변경했습니다.${
              result.renamedItems
                ? ` 담당 업무 ${result.renamedItems}건에도 반영했습니다.`
                : ""
            }`
          : patch.accessRole
            ? `${member.name}님을 ${patch.accessRole === "manager" ? "부서장으로 지정" : "구성원으로 변경"}했습니다.`
            : patch.logViewer !== undefined
              ? `${member.name}님의 전체 일지 열람을 ${patch.logViewer ? "허용" : "해제"}했습니다.`
              : ""
    );

    clearDraft(member);

    if (data && renamed && data.renamedItems) {
      onAssignmentsRenamed();
    }
  }

  async function changePolicy(patch: Partial<TeamPolicy>) {
    // Show the change right away; put the old value back if saving fails.
    const previous = policy;
    onMembersChange({ policy: { ...policy, ...patch } });
    const saved = await send(
      { method: "PATCH", body: JSON.stringify({ action: "update-policy", policy: patch }) },
      () => "운영 옵션을 저장했습니다."
    );
    if (!saved) {
      onMembersChange({ policy: previous });
    }
  }

  async function toggleViewer(member: TeamMember, value: boolean) {
    const previous = members;
    onMembersChange({
      members: members.map((entry) => (entry.id === member.id ? { ...entry, logViewer: value } : entry)),
    });
    const saved = await send(
      { method: "PATCH", body: JSON.stringify({ id: member.id, logViewer: value }) },
      () => `${member.name}님의 전체 일지 열람을 ${value ? "허용" : "해제"}했습니다.`
    );
    if (!saved) {
      onMembersChange({ members: previous });
    }
  }

  async function unlinkAccount(member: TeamMember) {
    if (
      !window.confirm(
        `${member.name}님의 로그인 계정 연결을 해제할까요?\n해제하면 그 계정으로는 이 보드에 들어올 수 없습니다. 새 계정의 가입 신청을 이 구성원에 연결할 수 있습니다.`
      )
    ) {
      return;
    }
    await send(
      { method: "PATCH", body: JSON.stringify({ id: member.id, action: "unlink-account" }) },
      () => `${member.name}님의 계정 연결을 해제했습니다.`
    );
  }

  async function moveMember(member: TeamMember, direction: -1 | 1) {
    const order = members.map((entry) => entry.id);
    const index = order.indexOf(member.id);
    const target = index + direction;

    if (index < 0 || target < 0 || target >= order.length) {
      return;
    }

    [order[index], order[target]] = [order[target], order[index]];
    await send({ method: "PATCH", body: JSON.stringify({ action: "reorder", order }) });
  }

  async function deleteMember(member: TeamMember) {
    if (!window.confirm(`'${member.name}' 구성원을 삭제할까요?`)) {
      return;
    }

    await send(
      { method: "DELETE", body: JSON.stringify({ id: member.id }) },
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
        className="tb-card my-6 w-full max-w-[820px] shadow-[var(--shadow-lg)]"
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
              {isManager
                ? "가입 승인, 부서장 지정, 담당자 명단을 관리합니다."
                : "구성원 정보는 부서장만 수정할 수 있습니다."}
            </p>
          </div>
          {isManager ? (
            <div className="tb-seg" role="tablist">
              {(
                [
                  ["members", "구성원"],
                  ["options", "운영 옵션"],
                ] as const
              ).map(([key, label]) => (
                <button
                  key={key}
                  type="button"
                  role="tab"
                  aria-selected={tab === key}
                  data-active={tab === key}
                  onClick={() => setTab(key)}
                  className="tb-seg-btn"
                >
                  {label}
                  {key === "members" && requests.length ? ` ${requests.length}` : ""}
                </button>
              ))}
            </div>
          ) : null}
          <button type="button" onClick={onOpenWorkLog} className="tb-btn text-sm">
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

          {isManager && tab === "options" ? (
            <PolicyEditor
              policy={policy}
              members={members}
              busy={busy}
              onChange={(patch) => void changePolicy(patch)}
              onToggleViewer={(member, value) => void toggleViewer(member, value)}
            />
          ) : null}

          {tab === "options" && isManager ? null : (
          <>
          {isManager && requests.length ? (
            <section
              aria-label="가입 신청"
              className="space-y-2 rounded-[var(--radius)] border border-[var(--warning-border)] bg-[var(--warning-soft)] p-3"
            >
              <h3 className="text-sm font-semibold">가입 신청 {requests.length}건</h3>
              {requests.map((joinRequest) => {
                const choice = approvalOf(joinRequest);
                return (
                  <div
                    key={joinRequest.id}
                    className="flex flex-wrap items-center gap-2 rounded-[var(--radius)] bg-[var(--surface)] px-3 py-2"
                  >
                    <div className="min-w-[120px] flex-1">
                      <div className="font-medium">{joinRequest.name}</div>
                      <div className="text-[11px] text-[var(--text-faint)]">
                        @{joinRequest.loginId} · {formatDate(joinRequest.createdAt)} 신청
                      </div>
                    </div>
                    <select
                      value={choice.memberId}
                      onChange={(event) =>
                        setApprovals((current) => ({
                          ...current,
                          [joinRequest.id]: { ...choice, memberId: Number(event.target.value) },
                        }))
                      }
                      className="tb-field w-auto !py-1.5 text-sm"
                      aria-label={`${joinRequest.name} 연결 대상`}
                    >
                      <option value={0}>새 구성원으로 추가</option>
                      {linkable.map((member) => (
                        <option key={member.id} value={member.id}>
                          기존 &apos;{member.name}&apos;에 연결
                        </option>
                      ))}
                    </select>
                    <select
                      value={choice.accessRole}
                      onChange={(event) =>
                        setApprovals((current) => ({
                          ...current,
                          [joinRequest.id]: {
                            ...choice,
                            accessRole: event.target.value as AccessRole,
                          },
                        }))
                      }
                      className="tb-field w-auto !py-1.5 text-sm"
                      aria-label={`${joinRequest.name} 권한`}
                    >
                      <option value="member">구성원</option>
                      <option value="manager">부서장</option>
                    </select>
                    <button
                      type="button"
                      onClick={() => void decide(joinRequest, true)}
                      disabled={busy}
                      className="tb-btn tb-btn-primary !px-3 !py-1.5 text-xs"
                    >
                      승인
                    </button>
                    <button
                      type="button"
                      onClick={() => void decide(joinRequest, false)}
                      disabled={busy}
                      className="tb-btn !px-3 !py-1.5 text-xs"
                    >
                      거절
                    </button>
                  </div>
                );
              })}
              <p className="text-[11px] leading-4 text-[var(--text-muted)]">
                기존 구성원에 연결하면 그 이름으로 된 담당 업무와 업무일지를 이어서
                관리합니다. 비밀번호를 잊은 구성원의 새 계정도 이렇게 연결합니다.
              </p>
            </section>
          ) : null}

          {isManager ? (
            <form
              onSubmit={addMember}
              className="grid gap-2 sm:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)_auto_auto]"
            >
              <input
                value={name}
                onChange={(event) => setName(event.target.value)}
                className="tb-field"
                placeholder="이름 (계정 없는 담당자)"
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
          ) : null}

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
                const isMe = member.id === viewer?.memberId;

                if (!isManager) {
                  return (
                    <li
                      key={member.id}
                      className="flex flex-wrap items-center gap-2 rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface)] px-3 py-2"
                    >
                      <span
                        className="h-6 w-6 shrink-0 rounded-[var(--radius-sm)] border border-[var(--border-strong)]"
                        style={{ background: member.color }}
                        aria-hidden="true"
                      />
                      <span className="font-medium">{member.name}</span>
                      {member.role ? (
                        <span className="text-xs text-[var(--text-faint)]">{member.role}</span>
                      ) : null}
                      <span className="ml-auto flex items-center gap-1">
                        {isMe ? <span className="tb-badge tb-badge-success">나</span> : null}
                        <RoleBadge member={member} />
                      </span>
                    </li>
                  );
                }

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
                      className="tb-field min-w-[110px] flex-1 !py-1.5 font-medium"
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
                      className="tb-field min-w-[90px] flex-1 !py-1.5"
                      placeholder="역할·직급"
                      aria-label="역할"
                      maxLength={40}
                    />
                    <div className="flex flex-wrap items-center gap-1">
                      {isMe ? <span className="tb-badge tb-badge-success">나</span> : null}
                      {member.hasAccount ? (
                        <>
                          <select
                            value={member.accessRole}
                            onChange={(event) =>
                              void updateMember(member, {
                                accessRole: event.target.value as AccessRole,
                              })
                            }
                            disabled={busy || isMe}
                            className="tb-field w-auto !py-1 text-xs"
                            aria-label={`${member.name} 권한`}
                            title={
                              isMe
                                ? "본인의 부서장 권한은 해제할 수 없습니다."
                                : member.loginId
                                  ? `@${member.loginId}`
                                  : undefined
                            }
                          >
                            <option value="member">구성원</option>
                            <option value="manager">부서장</option>
                          </select>
                          {!isMe ? (
                            <button
                              type="button"
                              onClick={() => void unlinkAccount(member)}
                              disabled={busy}
                              className="tb-btn !px-2 !py-1 text-xs"
                              title={member.loginId ? `@${member.loginId} 계정 연결 해제` : "계정 연결 해제"}
                            >
                              계정 해제
                            </button>
                          ) : null}
                        </>
                      ) : (
                        <RoleBadge member={member} />
                      )}
                      {!isMe ? (
                        <button
                          type="button"
                          onClick={() => void updateMember(member, { active: !member.active })}
                          disabled={busy}
                          className="tb-btn !px-2 !py-1 text-xs"
                          title={member.active ? "퇴사·휴직 등으로 숨기고 접속을 막음" : "다시 활성화"}
                        >
                          {member.active ? "비활성화" : "활성화"}
                        </button>
                      ) : null}
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
                      {!isMe ? (
                        <button
                          type="button"
                          onClick={() => void deleteMember(member)}
                          disabled={busy}
                          className="tb-iconbtn tb-iconbtn-danger h-7 w-7"
                          aria-label={`${member.name} 삭제`}
                        >
                          ×
                        </button>
                      ) : null}
                    </div>
                  </li>
                );
              })
            ) : (
              <li className="py-8 text-center text-sm text-[var(--text-muted)]">
                {members.length ? "활성 구성원이 없습니다." : "등록된 구성원이 없습니다."}
              </li>
            )}
          </ul>
          </>
          )}
          {isManager && tab === "members" ? (
            <p className="text-[11px] leading-4 text-[var(--text-faint)]">
              이름을 바꾸면 그 이름으로 지정된 업무의 담당자명과 업무일지에도 함께
              반영됩니다. 비활성화하면 그 계정은 보드에 접속할 수 없고 기존 기록은
              남습니다. 업무일지가 있는 구성원은 삭제 대신 비활성화해 주세요.
            </p>
          ) : null}
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

"use client";

import {
  BACKDATE_CHOICES,
  LOG_VISIBILITY_LABEL,
  type LogVisibility,
  type TeamMember,
  type TeamPolicy,
} from "./lib/team";

// 부서장's board-wide switches. Each change is saved right away; the API
// enforces every option, the UI only reflects them.

type PolicyEditorProps = {
  policy: TeamPolicy;
  members: TeamMember[];
  busy: boolean;
  onChange: (patch: Partial<TeamPolicy>) => void;
  onToggleViewer: (member: TeamMember, value: boolean) => void;
};

const VISIBILITY_HELP: Record<LogVisibility, string> = {
  own: "구성원은 자기 일지만 봅니다. 부서장은 항상 전체를 봅니다.",
  selected: "아래에서 지정한 구성원(예: 팀장, 선임)만 전체 일지를 봅니다.",
  team: "모든 구성원이 서로의 일지를 볼 수 있습니다. 수정은 여전히 본인만 가능합니다.",
};

function Switch({
  checked,
  disabled,
  onChange,
  label,
}: {
  checked: boolean;
  disabled?: boolean;
  onChange: (value: boolean) => void;
  label: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition disabled:cursor-not-allowed disabled:opacity-40 ${
        checked ? "bg-[var(--accent)]" : "bg-[var(--border-strong)]"
      }`}
    >
      <span
        className={`inline-block h-5 w-5 rounded-full bg-white shadow transition ${
          checked ? "translate-x-[22px]" : "translate-x-0.5"
        }`}
      />
    </button>
  );
}

function Row({
  title,
  help,
  children,
}: {
  title: string;
  help: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-start gap-3 border-b border-[var(--border)] py-3 last:border-b-0">
      <div className="min-w-0 flex-1">
        <div className="text-sm font-semibold">{title}</div>
        <p className="mt-0.5 text-xs leading-5 text-[var(--text-muted)]">{help}</p>
      </div>
      <div className="shrink-0 pt-0.5">{children}</div>
    </div>
  );
}

export default function PolicyEditor({
  policy,
  members,
  busy,
  onChange,
  onToggleViewer,
}: PolicyEditorProps) {
  const candidates = members.filter(
    (member) => member.active && member.hasAccount && member.accessRole !== "manager"
  );

  return (
    <div className="space-y-5">
      <section aria-labelledby="policy-logs">
        <h3 id="policy-logs" className="mb-1 text-sm font-semibold text-[var(--text-muted)]">
          업무일지
        </h3>
        <div className="rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface)] px-4">
          <div className="border-b border-[var(--border)] py-3">
            <div className="text-sm font-semibold">다른 구성원의 일지 열람</div>
            <div className="mt-2 grid gap-1.5" role="radiogroup" aria-label="일지 열람 범위">
              {(Object.keys(LOG_VISIBILITY_LABEL) as LogVisibility[]).map((value) => (
                <label
                  key={value}
                  className={`flex cursor-pointer items-start gap-2 rounded-[var(--radius)] border px-3 py-2 text-sm ${
                    policy.logVisibility === value
                      ? "border-[var(--accent)] bg-[var(--accent-soft)]"
                      : "border-[var(--border)]"
                  }`}
                >
                  <input
                    type="radio"
                    name="log-visibility"
                    checked={policy.logVisibility === value}
                    disabled={busy}
                    onChange={() => onChange({ logVisibility: value })}
                    className="mt-0.5 h-4 w-4 accent-[var(--accent)]"
                  />
                  <span>
                    <span className="font-medium">{LOG_VISIBILITY_LABEL[value]}</span>
                    <span className="block text-xs text-[var(--text-muted)]">
                      {VISIBILITY_HELP[value]}
                    </span>
                  </span>
                </label>
              ))}
            </div>
            {policy.logVisibility === "selected" ? (
              <div className="mt-3 rounded-[var(--radius)] bg-[var(--surface-2)] p-3">
                <div className="mb-2 text-xs font-semibold text-[var(--text-muted)]">
                  전체 일지를 볼 수 있는 구성원
                </div>
                {candidates.length ? (
                  <div className="flex flex-wrap gap-2">
                    {candidates.map((member) => (
                      <label
                        key={member.id}
                        className="flex cursor-pointer items-center gap-1.5 rounded-full border border-[var(--border)] bg-[var(--surface)] px-3 py-1 text-sm"
                      >
                        <input
                          type="checkbox"
                          checked={member.logViewer}
                          disabled={busy}
                          onChange={(event) => onToggleViewer(member, event.target.checked)}
                          className="h-3.5 w-3.5 accent-[var(--accent)]"
                        />
                        {member.name}
                        {member.role ? (
                          <span className="text-xs text-[var(--text-faint)]">{member.role}</span>
                        ) : null}
                      </label>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-[var(--text-faint)]">
                    계정이 연결된 구성원이 없습니다.
                  </p>
                )}
              </div>
            ) : null}
          </div>
          <Row
            title="승인 절차 사용"
            help="켜면 제출한 일지가 '승인 대기'가 되고 부서장이 승인·반려합니다. 끄면 일지는 기록만 됩니다."
          >
            <Switch
              label="승인 절차 사용"
              checked={policy.logApproval}
              disabled={busy}
              onChange={(value) => onChange({ logApproval: value })}
            />
          </Row>
          <Row
            title="승인된 일지 잠금"
            help="켜면 승인된 일지는 작성자도 수정·삭제할 수 없습니다. 끄면 수정할 수 있고, 수정하면 다시 승인 대기가 됩니다."
          >
            <Switch
              label="승인된 일지 잠금"
              checked={policy.lockApprovedLogs}
              disabled={busy || !policy.logApproval}
              onChange={(value) => onChange({ lockApprovedLogs: value })}
            />
          </Row>
          <Row
            title="지난 날짜 작성 허용 기간"
            help="며칠 전 일지까지 쓰거나 고칠 수 있는지 정합니다. 기간을 정하면 미래 날짜도 막습니다."
          >
            <select
              value={policy.logBackdateDays}
              disabled={busy}
              onChange={(event) => onChange({ logBackdateDays: Number(event.target.value) })}
              className="tb-field w-auto !py-1.5 text-sm"
              aria-label="지난 날짜 작성 허용 기간"
            >
              {BACKDATE_CHOICES.map((days) => (
                <option key={days} value={days}>
                  {days ? `${days}일 전까지` : "제한 없음"}
                </option>
              ))}
            </select>
          </Row>
        </div>
      </section>

      <section aria-labelledby="policy-items">
        <h3 id="policy-items" className="mb-1 text-sm font-semibold text-[var(--text-muted)]">
          워크 프로세스(업무)
        </h3>
        <div className="rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface)] px-4">
          <Row
            title="구성원의 새 업무 등록"
            help="켜면 구성원이 본인 담당 업무를 직접 만들 수 있습니다. 끄면 부서장만 업무를 만들고 배정합니다."
          >
            <Switch
              label="구성원의 새 업무 등록"
              checked={policy.memberCanCreateItems}
              disabled={busy}
              onChange={(value) => onChange({ memberCanCreateItems: value })}
            />
          </Row>
          <Row
            title="구성원의 본인 업무 삭제"
            help="켜면 구성원이 자기 담당 업무를 삭제할 수 있습니다. 끄면 삭제는 부서장만 합니다."
          >
            <Switch
              label="구성원의 본인 업무 삭제"
              checked={policy.memberCanDeleteItems}
              disabled={busy}
              onChange={(value) => onChange({ memberCanDeleteItems: value })}
            />
          </Row>
        </div>
      </section>
      <p className="text-[11px] leading-4 text-[var(--text-faint)]">
        옵션은 이 보드에만 적용되며 바로 저장됩니다. 다른 사람 업무·일지의 수정 금지는
        옵션과 관계없이 항상 유지됩니다.
      </p>
    </div>
  );
}

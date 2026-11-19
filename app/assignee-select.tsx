"use client";

import type { TeamMember } from "./lib/team";

// 담당자 pick list: the board's active members (plus the current name when it
// is not on the roster any more). Falls back to a text field only when the
// roster is empty, so a board without members still works.
export function AssigneeSelect({
  value,
  members,
  onChange,
  disabled,
  className = "tb-field",
  allowEmpty = true,
  ariaLabel = "담당자",
}: {
  value: string;
  members: TeamMember[];
  onChange: (value: string) => void;
  disabled?: boolean;
  className?: string;
  allowEmpty?: boolean;
  ariaLabel?: string;
}) {
  const names = [...new Set(members.filter((member) => member.active).map((member) => member.name.trim()).filter(Boolean))];
  if (!names.length) {
    return (
      <input
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
        className={className}
        placeholder="담당자"
        aria-label={ariaLabel}
      />
    );
  }
  const current = value.trim();
  const roleOf = (name: string) => members.find((member) => member.name.trim() === name)?.role ?? "";
  return (
    <select
      value={current}
      disabled={disabled}
      onChange={(event) => onChange(event.target.value)}
      className={className}
      aria-label={ariaLabel}
    >
      {allowEmpty || !current ? <option value="">{allowEmpty ? "미지정" : "담당자 선택"}</option> : null}
      {current && !names.includes(current) ? <option value={current}>{current} (명단에 없음)</option> : null}
      {names.map((name) => (
        <option key={name} value={name}>
          {roleOf(name) ? `${name} · ${roleOf(name)}` : name}
        </option>
      ))}
    </select>
  );
}

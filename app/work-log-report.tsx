"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import {
  daysBetween,
  kstToday,
  monthRange,
  shiftDate,
  shiftMonth,
  weekDates,
  WORK_LOG_RANGE_MAX_DAYS,
  type TeamMember,
  type TeamPolicy,
  type Viewer,
  type WorkLog,
} from "./lib/team";
import { categoryName, itemProgress, type WorkflowItem } from "./lib/workflow";
import {
  DEFAULT_REPORT_OPTIONS,
  renderPersonalReport,
  renderTeamSummary,
  type ReportFormat,
  type ReportItemInfo,
  type ReportOptions,
} from "./lib/work-log-report";
import { MemberPicker, type FetchLogs } from "./work-log-parts";

type Preset = "thisWeek" | "lastWeek" | "thisMonth" | "lastMonth" | "custom";

const PRESETS: Array<[Preset, string]> = [
  ["thisWeek", "이번 주"],
  ["lastWeek", "지난 주"],
  ["thisMonth", "이번 달"],
  ["lastMonth", "지난 달"],
  ["custom", "직접 지정"],
];

const OPTION_LABELS: Array<[keyof ReportOptions, string]> = [
  ["summary", "요약 통계"],
  ["items", "관련 업무 요약"],
  ["issues", "특이사항 모음"],
  ["signature", "결재란"],
  ["showMissing", "미작성 평일 표시"],
  ["approvedOnly", "승인된 일지만"],
];

function presetRange(preset: Exclude<Preset, "custom">, today: string) {
  if (preset === "thisWeek" || preset === "lastWeek") {
    const days = weekDates(preset === "thisWeek" ? today : shiftDate(today, -7), false);
    return { from: days[0], to: days[4] };
  }
  const month = (preset === "thisMonth" ? today : shiftMonth(today, -1)).slice(0, 7);
  return monthRange(month) ?? { from: today, to: today };
}

type WorkLogReportProps = {
  viewer: Viewer;
  members: TeamMember[];
  items: WorkflowItem[];
  policy: TeamPolicy;
  canSeeAll: boolean;
  organizationName: string;
  boardTitle: string;
  fetchLogs: FetchLogs;
};

export default function WorkLogReport({
  viewer,
  members,
  items,
  policy,
  canSeeAll,
  organizationName,
  boardTitle,
  fetchLogs,
}: WorkLogReportProps) {
  const today = kstToday();
  const frameRef = useRef<HTMLIFrameElement | null>(null);
  const [format, setFormat] = useState<ReportFormat>("personal");
  const [preset, setPreset] = useState<Preset>("thisMonth");
  const [custom, setCustom] = useState(() => presetRange("thisMonth", today));
  const [picked, setPicked] = useState<number[]>([viewer.memberId]);
  const [options, setOptions] = useState<ReportOptions>(DEFAULT_REPORT_OPTIONS);
  const [logs, setLogs] = useState<WorkLog[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const range = preset === "custom" ? custom : presetRange(preset, today);
  const rangeError =
    range.from > range.to
      ? "시작일이 종료일보다 늦습니다."
      : daysBetween(range.from, range.to) >= WORK_LOG_RANGE_MAX_DAYS
        ? `보고서 기간은 ${WORK_LOG_RANGE_MAX_DAYS}일 이내로 지정해 주세요.`
        : "";

  useEffect(() => {
    if (rangeError) {
      return;
    }
    let cancelled = false;
    const timer = window.setTimeout(() => {
      setLoading(true);
      setError("");
      fetchLogs(`from=${range.from}&to=${range.to}`)
        .then((result) => {
          if (!cancelled) {
            setLogs(result);
          }
        })
        .catch((loadError) => {
          if (!cancelled) {
            setError(loadError instanceof Error ? loadError.message : "업무일지를 불러오지 못했습니다.");
          }
        })
        .finally(() => {
          if (!cancelled) {
            setLoading(false);
          }
        });
    }, 0);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [fetchLogs, range.from, range.to, rangeError]);

  const reportMembers = useMemo(() => {
    const pool = canSeeAll ? members : members.filter((member) => member.id === viewer.memberId);
    const chosen = canSeeAll && picked.length
      ? pool.filter((member) => picked.includes(member.id))
      : canSeeAll
        ? pool.filter((member) => member.active)
        : pool;
    return chosen.map((member) => ({ id: member.id, name: member.name, role: member.role }));
  }, [canSeeAll, members, picked, viewer.memberId]);

  const html = useMemo(() => {
    const info = new Map<number, ReportItemInfo>(
      items.map((item) => [
        item.id,
        { title: item.title, category: categoryName(item.category), progress: itemProgress(item) },
      ])
    );
    const context = {
      organizationName,
      boardTitle,
      from: range.from,
      to: range.to,
      today,
      generatedAt: new Date().toLocaleString("ko-KR"),
      generatedBy: viewer.name,
      approval: policy.logApproval,
    };
    return format === "team"
      ? renderTeamSummary(context, reportMembers, logs, info, options)
      : renderPersonalReport(context, reportMembers, logs, info, options);
  }, [boardTitle, format, items, logs, options, organizationName, policy.logApproval, range.from, range.to, reportMembers, today, viewer.name]);

  function print() {
    const frame = frameRef.current?.contentWindow;
    if (frame) {
      frame.focus();
      frame.print();
    }
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[280px_minmax(0,1fr)]">
      <div className="space-y-4">
        {canSeeAll ? (
          <div>
            <span className="tb-label">형식</span>
            <div className="tb-seg w-full" role="tablist" aria-label="보고서 형식">
              {(
                [
                  ["personal", "개인 상세"],
                  ["team", "팀 요약표"],
                ] as const
              ).map(([key, label]) => (
                <button
                  key={key}
                  type="button"
                  role="tab"
                  aria-selected={format === key}
                  data-active={format === key}
                  onClick={() => {
                    setFormat(key);
                    setPicked(key === "team" ? [] : [viewer.memberId]);
                  }}
                  className="tb-seg-btn flex-1"
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
        ) : null}

        <div>
          <span className="tb-label">기간</span>
          <div className="flex flex-wrap gap-1.5">
            {PRESETS.map(([key, label]) => (
              <button
                key={key}
                type="button"
                aria-pressed={preset === key}
                onClick={() => {
                  if (key === "custom") {
                    setCustom(range);
                  }
                  setPreset(key);
                }}
                className={`rounded-full border px-2.5 py-1 text-xs font-medium ${
                  preset === key
                    ? "border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--accent)]"
                    : "border-[var(--border)] text-[var(--text-muted)]"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
          <div className="mt-2 grid grid-cols-2 gap-2">
            <input
              type="date"
              value={range.from}
              disabled={preset !== "custom"}
              onChange={(event) => setCustom((current) => ({ ...current, from: event.target.value }))}
              className="tb-field !py-1.5 text-sm"
              aria-label="보고서 시작일"
            />
            <input
              type="date"
              value={range.to}
              disabled={preset !== "custom"}
              onChange={(event) => setCustom((current) => ({ ...current, to: event.target.value }))}
              className="tb-field !py-1.5 text-sm"
              aria-label="보고서 종료일"
            />
          </div>
          {rangeError ? <p className="mt-1 text-xs text-[var(--danger)]">{rangeError}</p> : null}
        </div>

        {canSeeAll ? (
          <div>
            <span className="tb-label">
              대상 구성원{format === "personal" ? " (선택한 사람마다 한 부씩)" : ""}
            </span>
            <MemberPicker members={members} selected={picked} onChange={setPicked} />
          </div>
        ) : null}

        <div>
          <span className="tb-label">포함 항목</span>
          <div className="grid grid-cols-2 gap-1.5">
            {OPTION_LABELS.filter(([key]) => format === "personal" || key === "issues" || key === "approvedOnly")
              .filter(([key]) => policy.logApproval || key !== "approvedOnly")
              .map(([key, label]) => (
                <label key={key} className="flex items-center gap-1.5 text-sm">
                  <input
                    type="checkbox"
                    checked={options[key]}
                    onChange={(event) => setOptions((current) => ({ ...current, [key]: event.target.checked }))}
                    className="h-4 w-4 accent-[var(--accent)]"
                  />
                  {label}
                </label>
              ))}
          </div>
        </div>

        <div className="grid gap-2">
          <button
            type="button"
            onClick={print}
            disabled={loading || Boolean(rangeError) || !reportMembers.length}
            className="tb-btn tb-btn-primary"
          >
            🖨 인쇄 / PDF 저장
          </button>
          <p className="text-[11px] leading-4 text-[var(--text-faint)]">
            인쇄 창에서 대상을 &lsquo;PDF로 저장&rsquo;으로 고르면 파일로 보관할 수 있습니다. A4
            {format === "team" ? " (기간이 길면 가로)" : ""} 용지 기준입니다.
          </p>
        </div>
        {error ? (
          <div role="alert" className="rounded-[var(--radius)] border border-[var(--danger-border)] bg-[var(--danger-soft)] px-3 py-2 text-sm text-[var(--danger)]">
            {error}
          </div>
        ) : null}
      </div>

      <div className="min-w-0">
        <div className="mb-1.5 flex items-center justify-between text-xs text-[var(--text-muted)]">
          <span>미리보기 — 인쇄 결과와 같습니다</span>
          {loading ? <span>불러오는 중…</span> : <span>{reportMembers.length}명 · 일지 {logs.filter((log) => reportMembers.some((member) => member.id === log.memberId)).length}건</span>}
        </div>
        <iframe
          ref={frameRef}
          title="보고서 미리보기"
          srcDoc={html}
          className="h-[72vh] w-full rounded-[var(--radius)] border border-[var(--border)] bg-[#dfe5df]"
        />
      </div>
    </div>
  );
}

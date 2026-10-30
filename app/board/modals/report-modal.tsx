"use client";

import {
  assigneeName,
  formatDate,
} from "../../lib/workflow";
import { useBoard } from "../board-context";

export default function ReportModal() {
  const {
    organizationName,
    boardTitle,
    setReportOpen,
    reportMonth,
    setReportMonth,
    currentActor,
    report,
    reportSortButton,
    downloadReportCsv,
    printReport,
  } = useBoard();

  return (
    <div
      className="tb-print-shell fixed inset-0 z-50 flex items-start justify-center overflow-auto bg-black/40 p-4 backdrop-blur-sm"
      onClick={() => setReportOpen(false)}
    >
      <div
        className="tb-print-card tb-card my-6 w-full max-w-[1120px] shadow-[var(--shadow-lg)]"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="tb-print-toolbar flex flex-wrap items-center gap-2 border-b border-[var(--border)] px-5 py-3.5">
          <h2 className="text-base font-semibold">월간 보고서</h2>
          <input
            type="month"
            value={reportMonth}
            onChange={(event) => setReportMonth(event.target.value)}
            className="tb-field w-auto px-2 py-1.5 text-sm"
          />
          <div className="ml-auto flex items-center gap-2">
            <button
              type="button"
              onClick={downloadReportCsv}
              className="tb-btn text-sm"
            >
              CSV 다운로드
            </button>
            <button
              type="button"
              onClick={printReport}
              className="tb-btn tb-btn-primary text-sm"
            >
              인쇄 / PDF
            </button>
            <button
              aria-label="닫기"
              type="button"
              onClick={() => setReportOpen(false)}
              className="tb-iconbtn h-8 w-8"
            >
              ×
            </button>
          </div>
        </div>

        <div id="report-print" className="max-h-[74vh] overflow-auto p-5">
          <div className="tb-report-dashboard">
            <div className="mb-1 text-lg font-bold">
              {organizationName} 업무 보고서 — {report.month}
            </div>
            <div className="mb-5 text-xs text-[var(--text-faint)]">
              {boardTitle} · 생성 {formatDate(new Date().toISOString())} ·{" "}
              {currentActor}
            </div>

            <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
              <div className="tb-stat">
                <div className="tb-stat-label">이달 완료 단계</div>
                <div className="tb-stat-value text-[var(--success)]">
                  {report.stepsCompletedInMonth}
                </div>
              </div>
              <div className="tb-stat">
                <div className="tb-stat-label">이달 마감 업무</div>
                <div className="tb-stat-value">
                  {report.dueInMonthDone}/{report.dueInMonth}
                </div>
              </div>
              <div className="tb-stat">
                <div className="tb-stat-label">이달 신규 업무</div>
                <div className="tb-stat-value">{report.createdInMonth}</div>
              </div>
              <div className="tb-stat">
                <div className="tb-stat-label">현재 지연</div>
                <div className="tb-stat-value text-[var(--danger)]">
                  {report.overdueNow}
                </div>
              </div>
            </div>

            <div className="mb-6 grid gap-4 sm:grid-cols-2">
              <div className="rounded-[var(--radius)] border border-[var(--border)] p-4">
                <div className="mb-2 text-sm font-semibold">상태 분포</div>
                <div className="flex items-center gap-4">
                  {(() => {
                    const total =
                      report.statusCounts.reduce(
                        (sum, entry) => sum + entry.value,
                        0
                      ) || 1;
                    const R = 34;
                    const C = 2 * Math.PI * R;
                    const segments = report.statusCounts
                      .filter((entry) => entry.value > 0)
                      .map((entry, index, list) => ({
                        entry,
                        length: (entry.value / total) * C,
                        offset: list
                          .slice(0, index)
                          .reduce(
                            (sum, previous) => sum + (previous.value / total) * C,
                            0
                          ),
                      }));

                    return (
                      <svg
                        width="96"
                        height="96"
                        viewBox="0 0 96 96"
                        role="img"
                        aria-label="상태 분포 도넛 차트"
                      >
                        <circle
                          cx="48"
                          cy="48"
                          r={R}
                          fill="none"
                          stroke="#eef0f5"
                          strokeWidth="14"
                        />
                        {segments.map(({ entry, length, offset }) => (
                          <circle
                            key={entry.label}
                            cx="48"
                            cy="48"
                            r={R}
                            fill="none"
                            stroke={entry.color}
                            strokeWidth="14"
                            strokeDasharray={`${length} ${C - length}`}
                            strokeDashoffset={-offset}
                            transform="rotate(-90 48 48)"
                          />
                        ))}
                        <text
                          x="48"
                          y="52"
                          textAnchor="middle"
                          fontSize="16"
                          fontWeight="700"
                          fill="#1a1a2e"
                        >
                          {total}
                        </text>
                      </svg>
                    );
                  })()}
                  <div className="flex-1 space-y-1">
                    {report.statusCounts.map((entry) => (
                      <div
                        key={entry.label}
                        className="flex items-center gap-2 text-xs"
                      >
                        <span
                          className="h-2.5 w-2.5 rounded-full"
                          style={{ background: entry.color }}
                        />
                        <span className="flex-1 text-[var(--text-muted)]">
                          {entry.label}
                        </span>
                        <span className="font-semibold">{entry.value}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              <div className="rounded-[var(--radius)] border border-[var(--border)] p-4">
                <div className="mb-2 text-sm font-semibold">
                  담당자별 업무 수
                </div>
                {(() => {
                  const rows = report.assigneeRows.slice(0, 6);
                  const maxCount = Math.max(
                    ...rows.map((row) => row.count),
                    1
                  );
                  const rowH = 24;

                  return (
                    <svg
                      width="100%"
                      height={rows.length * rowH || rowH}
                      viewBox={`0 0 280 ${rows.length * rowH || rowH}`}
                      preserveAspectRatio="xMinYMin meet"
                      role="img"
                      aria-label="담당자별 업무 수 막대 차트"
                    >
                      {rows.map((row, index) => (
                        <g
                          key={row.assignee}
                          transform={`translate(0 ${index * rowH})`}
                        >
                          <text
                            x="0"
                            y="15"
                            fontSize="11"
                            fill="#61667a"
                          >
                            {row.assignee.length > 6
                              ? `${row.assignee.slice(0, 6)}…`
                              : row.assignee}
                          </text>
                          <rect
                            x="76"
                            y="5"
                            width={(row.count / maxCount) * 170}
                            height="12"
                            rx="6"
                            fill="#18786f"
                          />
                          <text
                            x={80 + (row.count / maxCount) * 170}
                            y="15"
                            fontSize="11"
                            fontWeight="700"
                            fill="#1a1a2e"
                          >
                            {row.count}
                          </text>
                        </g>
                      ))}
                    </svg>
                  );
                })()}
              </div>
            </div>

            <div className="mb-2 text-sm font-semibold">담당자별 현황</div>
            <table className="tb-table mb-6 text-xs">
              <thead>
                <tr className="text-left">
                  <th className="px-3 py-2">담당자</th>
                  <th className="px-3 py-2 text-right">업무 수</th>
                  <th className="px-3 py-2 text-right">평균 진행률</th>
                  <th className="px-3 py-2 text-right">이달 완료 단계</th>
                </tr>
              </thead>
              <tbody>
                {report.assigneeRows.map((row) => (
                  <tr key={row.assignee}>
                    <td className="px-3 py-2">{row.assignee}</td>
                    <td className="px-3 py-2 text-right">{row.count}</td>
                    <td className="px-3 py-2 text-right">{row.avgProgress}%</td>
                    <td className="px-3 py-2 text-right">
                      {row.completedSteps}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="tb-report-list-section overflow-x-auto">
            <div className="mb-2 text-sm font-semibold">업무 목록</div>
            <table className="tb-table tb-report-table min-w-[980px] text-[11px] sm:text-xs">
            <colgroup>
              <col className="w-[16%]" />
              <col className="w-[38%]" />
              <col className="w-[10%]" />
              <col className="w-[8%]" />
              <col className="w-[7%]" />
              <col className="w-[12%]" />
              <col className="w-[9%]" />
            </colgroup>
            <thead>
              <tr className="text-left">
                <th className="px-2 py-2">
                  {reportSortButton("category", "대분류")}
                </th>
                <th className="px-2 py-2">
                  {reportSortButton("title", "업무명")}
                </th>
                <th className="px-2 py-2 text-right">
                  {reportSortButton("budget", "예산", "right")}
                </th>
                <th className="px-2 py-2">
                  {reportSortButton("assignee", "담당")}
                </th>
                <th className="px-2 py-2 text-right">
                  {reportSortButton("progress", "진행률", "right")}
                </th>
                <th className="px-2 py-2">
                  {reportSortButton("dueDate", "마감일")}
                </th>
                <th className="px-2 py-2">
                  {reportSortButton("status", "상태")}
                </th>
              </tr>
            </thead>
            <tbody>
              {report.itemRows.map((row) => (
                <tr key={row.item.id}>
                  <td className="px-2 py-2">
                    <span
                      className="tb-report-cell"
                      title={row.categoryName}
                    >
                      {row.categoryName}
                    </span>
                  </td>
                  <td className="px-2 py-2">
                    <span
                      className="tb-report-cell"
                      title={row.item.title}
                    >
                      {row.item.title}
                    </span>
                  </td>
                  <td className="px-2 py-2 text-right">
                    <span
                      className="tb-report-cell text-right"
                      title={row.budgetLabel || "—"}
                    >
                      {row.budgetLabel || "—"}
                    </span>
                  </td>
                  <td className="px-2 py-2">
                    <span
                      className="tb-report-cell"
                      title={assigneeName(row.item.assignee)}
                    >
                      {assigneeName(row.item.assignee)}
                    </span>
                  </td>
                  <td className="px-2 py-2 text-right">
                    {row.progress}%
                  </td>
                  <td className="px-2 py-2">{row.item.dueDate ?? "—"}</td>
                  <td className="px-2 py-2">
                    <span
                      className={`tb-badge ${
                        row.status === "완료"
                          ? "tb-badge-complete"
                          : row.status === "지연"
                            ? "tb-badge-danger"
                            : row.status === "임박"
                              ? "tb-badge-warning"
                              : "tb-badge-muted"
                      }`}
                    >
                      {row.status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}

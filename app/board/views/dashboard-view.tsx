"use client";

import {
  DASHBOARD_WIDGETS,
} from "../../lib/board-config";
import {
  formatBudget,
  formatDate,
  formatDay,
  rowAccentColor,
  shortDueLabel,
  urgency,
} from "../../lib/workflow";
import { useBoard } from "../board-context";

export default function DashboardView() {
  const {
    history,
    assigneeSettings,
    setViewMode,
    widgetMenuOpen,
    setWidgetMenuOpen,
    widgetPrefs,
    pendingFlyToRef,
    setAssigneeFilter,
    setTemplateFilter,
    setStageFilter,
    loading,
    stages,
    overallProgress,
    bottlenecks,
    assigneeStats,
    dashboard,
    openItem,
    toggleWidget,
  } = useBoard();

  return (
    <div className="space-y-4">
      {loading ? (
        <div className="tb-card px-4 py-16 text-center text-sm text-[var(--text-muted)]">
          불러오는 중…
        </div>
      ) : null}

      <div className="flex items-center justify-end">
        <div className="relative">
          <button
            type="button"
            onClick={() => setWidgetMenuOpen((value) => !value)}
            data-active={widgetMenuOpen}
            className="tb-btn"
            title="대시보드 위젯 표시 설정"
          >
            <svg
              width="15"
              height="15"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <circle cx="12" cy="12" r="3" />
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1Z" />
            </svg>
            위젯
          </button>
          {widgetMenuOpen ? (
            <div className="tb-card absolute right-0 z-20 mt-1.5 w-52 p-2 shadow-[var(--shadow-md)]">
              {DASHBOARD_WIDGETS.map((widget) => (
                <label
                  key={widget.key}
                  className="flex cursor-pointer items-center gap-2 rounded-[var(--radius-sm)] px-2 py-1.5 text-sm hover:bg-[var(--surface-3)]"
                >
                  <input
                    type="checkbox"
                    checked={widgetPrefs[widget.key] !== false}
                    onChange={() => toggleWidget(widget.key)}
                    className="h-4 w-4 accent-[var(--accent)]"
                  />
                  {widget.label}
                </label>
              ))}
            </div>
          ) : null}
        </div>
      </div>

      {widgetPrefs.kpi !== false ? (
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <div className="tb-card tb-metric p-4">
          <div className="tb-stat-label">전체 진행률</div>
          <div className="tb-stat-value text-[var(--accent)]">
            {overallProgress}%
          </div>
          <div className="tb-progress mt-2">
            <span
              style={{
                width: `${overallProgress}%`,
                background: "var(--accent)",
              }}
            />
          </div>
        </div>
        <div className="tb-card tb-metric p-4">
          <div className="tb-stat-label">전체 업무</div>
          <div className="tb-stat-value">{dashboard.total}</div>
        </div>
        <div className="tb-card tb-metric p-4">
          <div className="tb-stat-label">진행 중</div>
          <div className="tb-stat-value">
            {dashboard.inProgress + dashboard.urgent}
          </div>
        </div>
        <div className="tb-card tb-metric p-4">
          <div className="tb-stat-label">완료</div>
          <div className="tb-stat-value text-[var(--success)]">
            {dashboard.done}
          </div>
        </div>
        <div className="tb-card tb-metric p-4">
          <div className="tb-stat-label">지연</div>
          <div className="tb-stat-value text-[var(--danger)]">
            {dashboard.overdue}
          </div>
        </div>
      </div>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-3">
        {widgetPrefs.status !== false ? (
        <div className="tb-card tb-section p-5">
          <h2 className="text-sm font-semibold">상태 분포</h2>
          <div className="mt-4 flex items-center gap-5">
            <div
              className="relative h-32 w-32 shrink-0 rounded-full"
              style={{ background: dashboard.conic }}
            >
              <div className="absolute inset-[14px] flex flex-col items-center justify-center rounded-full bg-[var(--surface)]">
                <div className="text-2xl font-bold">{dashboard.total}</div>
                <div className="text-[11px] text-[var(--text-faint)]">
                  전체
                </div>
              </div>
            </div>
            <div className="flex-1 space-y-1.5">
              {dashboard.statusSegments.map((segment) => (
                <div
                  key={segment.key}
                  className="flex items-center gap-2 text-sm"
                >
                  <span
                    className="h-2.5 w-2.5 rounded-full"
                    style={{ background: segment.color }}
                  />
                  <span className="flex-1 text-[var(--text-muted)]">
                    {segment.label}
                  </span>
                  <span className="font-semibold">{segment.value}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        ) : null}

        {widgetPrefs.workload !== false ? (
        <div className="tb-card tb-section p-5">
          <h2 className="text-sm font-semibold">담당자 워크로드</h2>
          <div className="mt-3 space-y-2.5">
            {assigneeStats.length ? (
              assigneeStats.slice(0, 6).map((stat) => {
                const maxCount = Math.max(
                  ...assigneeStats.map((value) => value.count),
                  1
                );
                return (
                  <button
                    key={stat.assignee}
                    type="button"
                    onClick={() => {
                      setAssigneeFilter(stat.assignee);
                      setViewMode("list");
                    }}
                    className="block w-full text-left"
                  >
                    <div className="flex items-center justify-between text-xs">
                      <span className="flex items-center gap-1.5">
                        <span
                          className="h-2.5 w-2.5 rounded-full"
                          style={{
                            backgroundColor: rowAccentColor(
                              assigneeSettings[stat.assignee]
                            ),
                          }}
                        />
                        {stat.assignee}
                      </span>
                      <span className="text-[var(--text-faint)]">
                        {stat.count}건 · {stat.progress}%
                      </span>
                    </div>
                    <div className="tb-progress mt-1">
                      <span
                        style={{
                          width: `${(stat.count / maxCount) * 100}%`,
                          background: "var(--accent)",
                        }}
                      />
                    </div>
                  </button>
                );
              })
            ) : (
              <div className="text-sm text-[var(--text-faint)]">
                담당자가 없습니다.
              </div>
            )}
          </div>
        </div>

        ) : null}

        {widgetPrefs.types !== false ? (
        <div className="tb-card tb-section p-5">
          <h2 className="text-sm font-semibold">유형별 업무</h2>
          <div className="mt-3 space-y-2.5">
            {dashboard.types.length ? (
              dashboard.types.map((type) => {
                const maxCount = Math.max(
                  ...dashboard.types.map((value) => value.count),
                  1
                );
                return (
                  <button
                    key={type.key}
                    type="button"
                    onClick={() => {
                      setTemplateFilter(type.key);
                      setStageFilter("all");
                      setViewMode("list");
                    }}
                    className="block w-full text-left"
                  >
                    <div className="flex items-center justify-between text-xs">
                      <span className="truncate pr-2">{type.name}</span>
                      <span className="text-[var(--text-faint)]">
                        {type.count}
                      </span>
                    </div>
                    <div className="tb-progress mt-1">
                      <span
                        style={{
                          width: `${(type.count / maxCount) * 100}%`,
                          background: "var(--accent)",
                        }}
                      />
                    </div>
                  </button>
                );
              })
            ) : (
              <div className="text-sm text-[var(--text-faint)]">
                업무가 없습니다.
              </div>
            )}
          </div>
        </div>
        ) : null}
      </div>

      <div className="grid gap-4 lg:grid-cols-[1.2fr_1fr]">
        {widgetPrefs.deadlines !== false ? (
        <div className="tb-card tb-section p-5">
          <h2 className="text-sm font-semibold">다가오는 마감</h2>
          <div className="mt-3 space-y-1.5">
            {dashboard.deadlines.length ? (
              dashboard.deadlines.map((deadline) => {
                const state = urgency(deadline.date);
                return (
                  <button
                    key={deadline.id}
                    type="button"
                    onClick={() => openItem(deadline.itemId)}
                    className="tb-line-button flex w-full items-center gap-2.5 rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-left transition hover:border-[var(--accent)] hover:bg-[var(--surface-3)]"
                  >
                    <span
                      className={`tb-badge ${
                        state === "overdue" || state === "danger"
                          ? "tb-badge-danger"
                          : state === "warning"
                            ? "tb-badge-warning"
                            : "tb-badge-muted"
                      }`}
                    >
                      {shortDueLabel(deadline.date)}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-medium">
                        {deadline.title}
                      </div>
                      <div className="text-[11px] text-[var(--text-faint)]">
                        {deadline.label} · {formatDay(deadline.date)}
                      </div>
                    </div>
                  </button>
                );
              })
            ) : (
              <div className="text-sm text-[var(--text-faint)]">
                예정된 마감이 없습니다.
              </div>
            )}
          </div>
        </div>
        ) : null}

        <div className="space-y-4">
          {widgetPrefs.budget !== false ? (
          <div className="tb-card tb-section p-5">
            <h2 className="text-sm font-semibold">예산 요약</h2>
            <div className="mt-3 space-y-3">
              <div>
                <div className="flex justify-between text-xs">
                  <span className="text-[var(--text-muted)]">편성 예산</span>
                  <span className="font-semibold">
                    {formatBudget(dashboard.allocated) || 0}
                  </span>
                </div>
                <div className="tb-progress mt-1">
                  <span
                    style={{
                      width: `${
                        (dashboard.allocated /
                          Math.max(
                            dashboard.allocated,
                            dashboard.required,
                            1
                          )) *
                        100
                      }%`,
                      background: "var(--accent)",
                    }}
                  />
                </div>
              </div>
              <div>
                <div className="flex justify-between text-xs">
                  <span className="text-[var(--text-muted)]">소요 예산</span>
                  <span className="font-semibold">
                    {formatBudget(dashboard.required) || 0}
                  </span>
                </div>
                <div className="tb-progress mt-1">
                  <span
                    style={{
                      width: `${
                        (dashboard.required /
                          Math.max(
                            dashboard.allocated,
                            dashboard.required,
                            1
                          )) *
                        100
                      }%`,
                      background: "var(--warning)",
                    }}
                  />
                </div>
              </div>
            </div>
          </div>

          ) : null}

          {widgetPrefs.bottlenecks !== false ? (
          <div className="tb-card tb-section p-5">
            <h2 className="text-sm font-semibold">병목 단계</h2>
            <div className="mt-3 flex flex-wrap gap-2">
              {bottlenecks.length ? (
                bottlenecks.slice(0, 6).map((bottleneck) => (
                  <button
                    key={bottleneck.title}
                    type="button"
                    onClick={() => {
                      const stage = stages.find(
                        (value) => value.title === bottleneck.title
                      );
                      setStageFilter(stage?.stageKey ?? "all");
                      setViewMode("list");
                    }}
                    className="tb-chip tb-chip-btn"
                  >
                    {bottleneck.title}
                    <span className="tb-badge tb-badge-muted">
                      {bottleneck.count}
                    </span>
                  </button>
                ))
              ) : (
                <div className="text-sm text-[var(--text-faint)]">
                  병목이 없습니다.
                </div>
              )}
            </div>
          </div>
          ) : null}

          {widgetPrefs.regions !== false ? (
          <div className="tb-card tb-section p-5">
            <h2 className="text-sm font-semibold">지역 현황</h2>
            <div className="mt-3 space-y-1">
              {dashboard.regions.length ? (
                dashboard.regions.map((region) => (
                  <button
                    key={region.name}
                    type="button"
                    onClick={() => {
                      if (region.lat !== null && region.lng !== null) {
                        pendingFlyToRef.current = [region.lat, region.lng];
                      }
                      setViewMode("map");
                    }}
                    className="flex w-full items-center gap-2 rounded-[var(--radius-sm)] px-2 py-1.5 text-left text-sm transition hover:bg-[var(--surface-3)]"
                    title="지도에서 보기"
                  >
                    <span className="min-w-0 flex-1 truncate">
                      📍 {region.name}
                    </span>
                    <span className="tb-badge tb-badge-muted shrink-0">
                      {region.done}/{region.count}
                    </span>
                  </button>
                ))
              ) : (
                <div className="text-sm text-[var(--text-faint)]">
                  위치가 지정된 업무가 없습니다.
                </div>
              )}
              {dashboard.unlocatedCount ? (
                <button
                  type="button"
                  onClick={() => setViewMode("map")}
                  className="flex w-full items-center gap-2 rounded-[var(--radius-sm)] px-2 py-1.5 text-left text-sm text-[var(--text-faint)] transition hover:bg-[var(--surface-3)]"
                  title="지도 뷰에서 위치를 지정하세요"
                >
                  <span className="min-w-0 flex-1">위치 미지정</span>
                  <span className="tb-badge tb-badge-muted shrink-0">
                    {dashboard.unlocatedCount}
                  </span>
                </button>
              ) : null}
            </div>
          </div>
          ) : null}
        </div>
      </div>

      {widgetPrefs.activity !== false ? (
      <div className="tb-card tb-section p-5">
        <h2 className="text-sm font-semibold">최근 활동</h2>
        <div className="mt-3 grid gap-2.5 sm:grid-cols-2">
          {history.slice(0, 10).map((entry) => (
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
              활동 기록이 없습니다.
            </div>
          ) : null}
        </div>
      </div>
      ) : null}
    </div>
  );
}

"use client";

import {
  isoDate,
} from "../../lib/board-config";
import {
  assigneeName,
  formatDay,
  itemProgress,
  rowAccentColor,
} from "../../lib/workflow";
import { useBoard } from "../board-context";

export default function GanttView() {
  const {
    assigneeSettings,
    ganttDrag,
    gantt,
    openItem,
    startGanttDrag,
    progressColor,
  } = useBoard();

  return (
    <div className="tb-card overflow-hidden">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-b border-[var(--border)] px-4 py-2.5 text-[11px] text-[var(--text-muted)]">
        <span className="flex items-center gap-1.5">
          <span className="h-2 w-6 rounded-full bg-[var(--accent)]" />
          등록 → 마감 (채움 = 진행률)
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-full border-2 border-[var(--accent)] bg-white" />
          단계 목표일
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-full bg-[var(--success)]" />
          완료 단계
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-3 w-0.5 bg-[var(--danger)]" />
          오늘
        </span>
      </div>

      <div className="overflow-x-auto">
        <div className="min-w-[760px]">
          <div className="grid grid-cols-[230px_1fr] border-b border-[var(--border)] bg-[var(--surface-2)]">
            <div className="px-3 py-2 text-[11px] font-semibold text-[var(--text-muted)]">
              업무
            </div>
            <div className="relative h-8">
              {gantt.ticks.map((tick) => (
                <span
                  key={tick.pct}
                  className="absolute top-1/2 -translate-x-1/2 -translate-y-1/2 text-[10px] font-medium text-[var(--text-faint)]"
                  style={{ left: `${tick.pct}%` }}
                >
                  {tick.label}
                </span>
              ))}
            </div>
          </div>

          {gantt.rows.length ? (
            gantt.rows.map(({ item, startPct, endPct, markers }) => {
              const rowColor = rowAccentColor(
                assigneeSettings[assigneeName(item.assignee)]
              );
              const progress = itemProgress(item);

              return (
                <div
                  key={item.id}
                  className="grid grid-cols-[230px_1fr] border-b border-[var(--border)] last:border-b-0 hover:bg-[var(--surface-2)]"
                >
                  <button
                    type="button"
                    onClick={() => openItem(item.id)}
                    className="min-w-0 px-3 py-2 text-left"
                    style={{ boxShadow: `inset 3px 0 0 ${rowColor}` }}
                    title="목록에서 열기"
                  >
                    <div className="truncate text-sm font-medium">
                      {item.title || "제목 없음"}
                    </div>
                    <div className="truncate text-[11px] text-[var(--text-faint)]">
                      {assigneeName(item.assignee)} · {progress}%
                    </div>
                  </button>

                  <div className="relative h-12" data-gantt-timeline>
                    {gantt.ticks.slice(1, -1).map((tick) => (
                      <span
                        key={tick.pct}
                        className="absolute bottom-0 top-0 w-px bg-[var(--border)] opacity-60"
                        style={{ left: `${tick.pct}%` }}
                      />
                    ))}
                    <span
                      className="absolute bottom-0 top-0 w-0.5 bg-[var(--danger)] opacity-70"
                      style={{ left: `${gantt.todayPct}%` }}
                      title="오늘"
                    />

                    {endPct !== null ? (
                      <div
                        className="absolute top-1/2 h-2.5 -translate-y-1/2 overflow-hidden rounded-full bg-[var(--surface-3)]"
                        style={{
                          left: `${startPct}%`,
                          width: `${Math.max(endPct - startPct, 0.8)}%`,
                        }}
                        title={`${item.title} · ${formatDay(item.dueDate) || "마감 미지정"}`}
                      >
                        <span
                          className="block h-full rounded-full"
                          style={{
                            width: `${progress}%`,
                            background: progressColor(item),
                          }}
                        />
                      </div>
                    ) : (
                      <span
                        className="absolute top-1/2 -translate-y-1/2 text-[10px] text-[var(--text-faint)]"
                        style={{ left: `${startPct}%` }}
                      >
                        ◦ 일정 미지정
                      </span>
                    )}

                    {markers.map((marker) => (
                      <span
                        key={marker.id}
                        className={`absolute top-1/2 h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 ${
                          marker.done
                            ? "border-[var(--complete)] bg-[var(--complete)]"
                            : "border-[var(--accent)] bg-white"
                        }`}
                        style={{ left: `${marker.pct}%` }}
                        title={marker.title}
                      />
                    ))}

                    <button
                      type="button"
                      onPointerDown={(event) =>
                        startGanttDrag(event, item.id)
                      }
                      className="absolute top-1/2 z-10 h-4 w-4 -translate-x-1/2 -translate-y-1/2 cursor-ew-resize rounded-full border-2 border-white shadow"
                      style={{
                        left: `${endPct ?? startPct}%`,
                        background:
                          endPct !== null
                            ? progressColor(item)
                            : "var(--text-faint)",
                        touchAction: "none",
                      }}
                      title={
                        endPct !== null
                          ? "드래그해 마감일 조정"
                          : "드래그해 마감일 설정"
                      }
                    />

                    {ganttDrag?.itemId === item.id ? (
                      <>
                        <span
                          className="pointer-events-none absolute bottom-0 top-0 w-0.5 bg-[var(--accent)]"
                          style={{ left: `${ganttDrag.pct}%` }}
                        />
                        <span
                          className="pointer-events-none absolute top-0 -translate-x-1/2 rounded bg-[var(--accent)] px-1.5 py-0.5 text-[10px] font-bold text-white"
                          style={{ left: `${ganttDrag.pct}%` }}
                        >
                          {isoDate(
                            new Date(
                              gantt.min + (gantt.span * ganttDrag.pct) / 100
                            )
                          )
                            .slice(5)
                            .replace("-", ".")}
                        </span>
                      </>
                    ) : null}
                  </div>
                </div>
              );
            })
          ) : (
            <div className="px-4 py-14 text-center text-sm text-[var(--text-muted)]">
              표시할 업무가 없습니다.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

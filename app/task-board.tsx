"use client";

import { lazy, Suspense, useEffect } from "react";

import ActivityPanels from "./board/activity-panels";
import { BoardContext } from "./board/board-context";
import BoardFooter from "./board/board-footer";
import BoardHeader from "./board/board-header";
import LandingScreen from "./board/landing-screen";
import LockedScreen from "./board/locked-screen";
import { useTaskBoard } from "./board/use-task-board";
import ListView from "./board/views/list-view";
import { WETLAND_PRESETS } from "./lib/wetlands";

// 기본 화면(목록)을 제외한 보기와 팝업은 처음 열 때 불러와 초기 번들을 줄입니다.
const DashboardView = lazy(() => import("./board/views/dashboard-view"));
const MapView = lazy(() => import("./board/views/map-view"));
const GridView = lazy(() => import("./board/views/grid-view"));
const GanttView = lazy(() => import("./board/views/gantt-view"));
const ManualModal = lazy(() => import("./board/modals/manual-modal"));
const TemplateEditorModal = lazy(
  () => import("./board/modals/template-editor-modal")
);
const NotificationsPanel = lazy(
  () => import("./board/modals/notifications-panel")
);
const MapSettingsModal = lazy(() => import("./board/modals/map-settings-modal"));
const MapDraftModal = lazy(() => import("./board/modals/map-draft-modal"));
const FiltersDrawer = lazy(() => import("./board/modals/filters-drawer"));
const DocumentsModal = lazy(() => import("./board/modals/documents-modal"));
const DuplicateModal = lazy(() => import("./board/modals/duplicate-modal"));
const ReportModal = lazy(() => import("./board/modals/report-modal"));

function ViewFallback() {
  return (
    <div className="tb-card px-4 py-16 text-center text-sm text-[var(--text-muted)]">
      불러오는 중…
    </div>
  );
}

export default function TaskBoard() {
  const board = useTaskBoard();
  const {
    landingOpen,
    workspaceLocked,
    error,
    viewMode,
    categories,
    manualOpen,
    templateEditorOpen,
    templateDraft,
    notifOpen,
    mapSettingsOpen,
    mapDraft,
    showFilters,
    docsOpen,
    duplicateTarget,
    reportOpen,
    setManualOpen,
    setTemplateEditorOpen,
    setTemplateDraft,
    setNotifOpen,
    setMapSettingsOpen,
    setMapDraft,
    setShowFilters,
    setDocsOpen,
    setDuplicateTarget,
    setReportOpen,
  } = board;

  // Esc 키로 가장 위에 열린 팝업부터 닫습니다(화면에 늦게 그려진 순서가 위).
  useEffect(() => {
    const closers: Array<[boolean, () => void]> = [
      [reportOpen, () => setReportOpen(false)],
      [duplicateTarget !== null, () => setDuplicateTarget(null)],
      [docsOpen, () => setDocsOpen(false)],
      [showFilters, () => setShowFilters(false)],
      [mapDraft !== null, () => setMapDraft(null)],
      [mapSettingsOpen, () => setMapSettingsOpen(false)],
      [notifOpen, () => setNotifOpen(false)],
      [
        templateEditorOpen,
        () => {
          setTemplateEditorOpen(false);
          setTemplateDraft(null);
        },
      ],
      [manualOpen, () => setManualOpen(false)],
    ];
    const close = closers.find(([open]) => open)?.[1];

    if (!close) {
      return;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !event.defaultPrevented) {
        close();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [
    docsOpen,
    duplicateTarget,
    manualOpen,
    mapDraft,
    mapSettingsOpen,
    notifOpen,
    reportOpen,
    setDocsOpen,
    setDuplicateTarget,
    setManualOpen,
    setMapDraft,
    setMapSettingsOpen,
    setNotifOpen,
    setReportOpen,
    setShowFilters,
    setTemplateDraft,
    setTemplateEditorOpen,
    showFilters,
    templateEditorOpen,
  ]);

  if (landingOpen) {
    return (
      <BoardContext.Provider value={board}>
        <LandingScreen />
      </BoardContext.Provider>
    );
  }

  return (
    <BoardContext.Provider value={board}>
      <main className="tb-app min-h-dvh">
        <BoardHeader />

        {workspaceLocked ? <LockedScreen /> : null}

        <section
          className={`mx-auto max-w-[1600px] px-4 py-5 sm:px-6 lg:px-8 ${
            workspaceLocked ? "hidden" : ""
          }`}
        >
          {error ? (
            <div
              role="alert"
              className="mb-4 flex items-center gap-2 rounded-[var(--radius)] border border-[var(--danger-border)] bg-[var(--danger-soft)] px-4 py-3 text-sm font-medium text-[var(--danger)]"
            >
              {error}
            </div>
          ) : null}

          <Suspense fallback={<ViewFallback />}>
            {viewMode === "dashboard" ? (
              <DashboardView />
            ) : viewMode === "list" ? (
              <ListView />
            ) : viewMode === "map" ? (
              <MapView />
            ) : viewMode === "grid" ? (
              <GridView />
            ) : (
              <GanttView />
            )}
          </Suspense>

          <ActivityPanels />
        </section>

        <BoardFooter />

        <Suspense fallback={null}>
          {manualOpen ? <ManualModal /> : null}
          {templateEditorOpen && templateDraft ? <TemplateEditorModal /> : null}
          {notifOpen ? <NotificationsPanel /> : null}
          {mapSettingsOpen ? <MapSettingsModal /> : null}
          {mapDraft ? <MapDraftModal /> : null}
          {showFilters ? <FiltersDrawer /> : null}
          {docsOpen ? <DocumentsModal /> : null}
          {duplicateTarget ? <DuplicateModal /> : null}
          {reportOpen ? <ReportModal /> : null}
        </Suspense>

        <datalist id="wetland-presets">
          {WETLAND_PRESETS.map((preset) => (
            <option key={preset.name} value={preset.name} />
          ))}
        </datalist>

        <datalist id="group-list">
          {categories
            .filter((name) => name !== "미분류")
            .map((name) => (
              <option key={name} value={name} />
            ))}
        </datalist>
      </main>
    </BoardContext.Provider>
  );
}

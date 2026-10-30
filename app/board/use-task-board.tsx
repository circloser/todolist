"use client";

import {
  DragEvent,
  FormEvent,
  PointerEvent as ReactPointerEvent,
  useEffect,
  useMemo,
  useDeferredValue,
  useRef,
  useState,
} from "react";
import type * as LeafletNS from "leaflet";
import {
  categoryKey,
  categoryPath,
  defaultSettings,
  defaultTemplates,
  defaultWidgetPrefs,
  escapeHtml,
  isoDate,
  periodRange,
} from "../lib/board-config";
import {
  WETLAND_PRESETS,
} from "../lib/wetlands";
import {
  assigneeName,
  completionCount,
  formatBudget,
  isItemDone,
  itemHasDueInRange,
  itemHasOverdueDate,
  itemHasUrgentDate,
  itemProgress,
  nextStep,
  urgency,
  type AppSettings,
  type DocumentTemplate,
  type DueFilter,
  type HistoryEntry,
  type SortMode,
  type StepStatus,
  type SubtaskDraft,
  type TaskFilter,
  type TaskResponse,
  type TemplateOption,
  type ViewMode,
  type WorkflowItem,
  type WorkflowStep,
  type WorkflowSubtask,
  type WorkspaceSummary,
} from "../lib/workflow";
import {
  COMPLETE_COLOR,
  ReportSortKey,
  SortDirection,
  MapProvider,
  MapStyle,
  MapSearchResult,
  DropEdge,
  DropIndicator,
  REPORT_STATUS_ORDER,
  replaceCategoryPrefix,
  storedCategoryName,
  mapTileConfig,
  readMapPrefs,
  WORKSPACE_STORAGE_KEY,
  RECENT_WORKSPACES_STORAGE_KEY,
  readStoredWorkspaceId,
  readRecentWorkspaceIds,
  workspacePasswordKey,
  readWorkspacePassword,
  readStoredUserName,
  workspaceYear,
  workspaceTeam,
  workspaceOrganizationName,
} from "./board-utils";

export function useTaskBoard() {
  const [items, setItems] = useState<WorkflowItem[]>([]);
  const [templates, setTemplates] = useState<TemplateOption[]>(defaultTemplates);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [assigneeSettings, setAssigneeSettings] = useState<Record<string, string>>(
    {}
  );
  const [organizationName, setOrganizationName] = useState(
    defaultSettings.organizationName
  );
  const [boardTitle, setBoardTitle] = useState(defaultSettings.boardTitle);
  const [activeWorkspaceId, setActiveWorkspaceId] = useState(readStoredWorkspaceId);
  const [activeWorkspace, setActiveWorkspace] = useState<WorkspaceSummary | null>(
    null
  );
  const [workspaces, setWorkspaces] = useState<WorkspaceSummary[]>([]);
  const [workspacePassword, setWorkspacePassword] = useState(() =>
    readWorkspacePassword(readStoredWorkspaceId())
  );
  const [workspacePasswordInput, setWorkspacePasswordInput] = useState("");
  const [workspaceLocked, setWorkspaceLocked] = useState(false);
  const [landingOpen, setLandingOpen] = useState(() =>
    !readWorkspacePassword(readStoredWorkspaceId())
  );
  const [workspaceDepartmentDraft, setWorkspaceDepartmentDraft] = useState("");
  const [workspaceTeamDraft, setWorkspaceTeamDraft] = useState("");
  const [newWorkspaceDepartment, setNewWorkspaceDepartment] = useState("");
  const [newWorkspaceTeam, setNewWorkspaceTeam] = useState("");
  const [newWorkspacePassword, setNewWorkspacePassword] = useState("");
  const [copyPreviousYear, setCopyPreviousYear] = useState(false);
  const [sourceWorkspacePassword, setSourceWorkspacePassword] = useState("");
  const [workspacePasswordDraft, setWorkspacePasswordDraft] = useState("");
  const [creatingWorkspace, setCreatingWorkspace] = useState(false);
  const [savingWorkspace, setSavingWorkspace] = useState(false);
  const [userName, setUserName] = useState(readStoredUserName);
  const [recentWorkspaceIds, setRecentWorkspaceIds] = useState(
    readRecentWorkspaceIds
  );
  const [filter, setFilter] = useState<TaskFilter>("all");
  const [dueFilter, setDueFilter] = useState<DueFilter>("all");
  const [sortMode, setSortMode] = useState<SortMode>("manual");
  const [viewMode, setViewMode] = useState<ViewMode>("list");
  const [showFilters, setShowFilters] = useState(false);
  const [templateEditorOpen, setTemplateEditorOpen] = useState(false);
  const [templateDraft, setTemplateDraft] = useState<{
    key: string | null;
    name: string;
    stages: Array<{ stageKey: string | null; title: string; group: string }>;
  } | null>(null);
  const [savingTemplate, setSavingTemplate] = useState(false);
  const [focusItemId, setFocusItemId] = useState<number | null>(null);
  const [notifOpen, setNotifOpen] = useState(false);
  const [widgetMenuOpen, setWidgetMenuOpen] = useState(false);
  const [widgetPrefs, setWidgetPrefs] =
    useState<Record<string, boolean>>(defaultWidgetPrefs);
  const [mapReady, setMapReady] = useState(0);
  // MapView is lazy-loaded, so the container may mount after viewMode flips.
  const [mapContainerMounted, setMapContainerMounted] = useState(false);
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const leafletLibRef = useRef<typeof LeafletNS | null>(null);
  const leafletMapRef = useRef<LeafletNS.Map | null>(null);
  const markerLayerRef = useRef<LeafletNS.LayerGroup | null>(null);
  const tileLayerRef = useRef<LeafletNS.TileLayer | null>(null);
  const landingPasswordRef = useRef<HTMLInputElement | null>(null);
  const openItemRef = useRef<(id: number) => void>(() => {});
  const clearMapPinRef = useRef<(id: number) => void>(() => {});
  const moveMapPinRef = useRef<(id: number, lat: number, lng: number) => void>(
    () => {}
  );
  const [placingItemId, setPlacingItemId] = useState<number | null>(null);
  const placingItemIdRef = useRef<number | null>(null);
  const placeItemAtRef = useRef<(id: number, lat: number, lng: number) => void>(
    () => {}
  );
  const pendingFlyToRef = useRef<[number, number] | null>(null);
  const [creatingOnMap, setCreatingOnMap] = useState(false);
  const creatingOnMapRef = useRef(false);
  const mapCreateAtRef = useRef<(lat: number, lng: number) => void>(() => {});
  const [mapDraft, setMapDraft] = useState<{ lat: number; lng: number } | null>(
    null
  );
  const [mapNewTitle, setMapNewTitle] = useState("");
  const [mapNewAssignee, setMapNewAssignee] = useState("");
  const [mapNewLocation, setMapNewLocation] = useState("");
  const [initialMapPrefs] = useState(readMapPrefs);
  const [mapProvider, setMapProvider] = useState<MapProvider>(
    initialMapPrefs.provider
  );
  const [mapStyle, setMapStyle] = useState<MapStyle>(initialMapPrefs.style);
  const [googleMapKey, setGoogleMapKey] = useState(initialMapPrefs.googleKey);
  const [vworldMapKey, setVworldMapKey] = useState(initialMapPrefs.vworldKey);
  const [mapSearchQuery, setMapSearchQuery] = useState("");
  const [mapSearchResults, setMapSearchResults] = useState<MapSearchResult[]>([]);
  const [mapSearching, setMapSearching] = useState(false);
  const [mapSearchError, setMapSearchError] = useState("");
  const [mapSettingsOpen, setMapSettingsOpen] = useState(false);
  const [ganttDrag, setGanttDrag] = useState<{
    itemId: number;
    pct: number;
  } | null>(null);
  const [linkDrafts, setLinkDrafts] = useState<
    Record<number, { title: string; url: string }>
  >({});
  const [duplicateTarget, setDuplicateTarget] = useState<WorkflowItem | null>(
    null
  );
  const [reportOpen, setReportOpen] = useState(false);
  const [docsOpen, setDocsOpen] = useState(false);
  const [manualOpen, setManualOpen] = useState(false);
  const [documents, setDocuments] = useState<DocumentTemplate[]>([]);
  const [docsLoading, setDocsLoading] = useState(false);
  const [uploadingDoc, setUploadingDoc] = useState(false);
  const [docName, setDocName] = useState("");
  const [docFile, setDocFile] = useState<File | null>(null);
  const [reportMonth, setReportMonth] = useState(() =>
    isoDate(new Date()).slice(0, 7)
  );
  const [reportSort, setReportSort] = useState<{
    key: ReportSortKey;
    direction: SortDirection;
  }>({ key: "category", direction: "asc" });
  const [webhookUrl, setWebhookUrl] = useState("");
  const [webhookEnabled, setWebhookEnabled] = useState(false);
  const [savingWebhook, setSavingWebhook] = useState(false);
  const [sendingAlerts, setSendingAlerts] = useState(false);
  const [alertResult, setAlertResult] = useState("");
  const [assigneeFilter, setAssigneeFilter] = useState("all");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [templateFilter, setTemplateFilter] = useState("all");
  const [stageFilter, setStageFilter] = useState("all");
  const [keyword, setKeyword] = useState("");
  // 입력은 즉시 반영하고, 목록 필터링은 한 박자 늦게 계산해 타이핑이 끊기지 않게 합니다.
  const deferredKeyword = useDeferredValue(keyword);
  const [newTitle, setNewTitle] = useState("");
  const [newAssignee, setNewAssignee] = useState("");
  const [newMemo, setNewMemo] = useState("");
  const [newAllocatedBudget, setNewAllocatedBudget] = useState("");
  const [newRequiredBudget, setNewRequiredBudget] = useState("");
  const [newDueDate, setNewDueDate] = useState("");
  const [newTemplateKey, setNewTemplateKey] = useState(
    "external-research-outsourcing"
  );
  const [expandedIds, setExpandedIds] = useState<Set<number>>(new Set());
  const [expandedStepIds, setExpandedStepIds] = useState<Set<number>>(
    new Set()
  );
  const [subtaskDrafts, setSubtaskDrafts] = useState<
    Record<number, SubtaskDraft>
  >({});
  const [stepDrafts, setStepDrafts] = useState<Record<number, string>>({});
  const [newGroup, setNewGroup] = useState("");
  const [newCategoryName, setNewCategoryName] = useState("");
  const [activeAddGroup, setActiveAddGroup] = useState<string | null>(null);
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());
  const [groupOrder, setGroupOrder] = useState<string[]>([]);
  const [draggedGroup, setDraggedGroup] = useState<string | null>(null);
  const [dropIndicator, setDropIndicator] = useState<DropIndicator | null>(null);
  const [editingGroup, setEditingGroup] = useState<string | null>(null);
  const [groupNameDraft, setGroupNameDraft] = useState("");
  const [deletingGroups, setDeletingGroups] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [savingGroup, setSavingGroup] = useState(false);
  const [savingSettings, setSavingSettings] = useState(false);
  const [draggedId, setDraggedId] = useState<number | null>(null);
  const [savingOrder, setSavingOrder] = useState(false);
  const [savingItemIds, setSavingItemIds] = useState<Set<number>>(new Set());
  const [deletingItemIds, setDeletingItemIds] = useState<Set<number>>(new Set());
  const [savingStepIds, setSavingStepIds] = useState<Set<number>>(new Set());
  const [savingSubtaskIds, setSavingSubtaskIds] = useState<Set<number>>(new Set());
  const [error, setError] = useState("");
  const currentActor = userName.trim() || "사용자";

  function workspaceHeaders(
    init?: HeadersInit,
    passwordOverride?: string,
    workspaceIdOverride?: string
  ) {
    const headers = new Headers(init);
    headers.set("X-Workspace-Id", workspaceIdOverride ?? activeWorkspaceId);

    const password = passwordOverride ?? workspacePassword;
    if (password) {
      headers.set("X-Workspace-Password", password);
    }

    return headers;
  }

  function taskRequest(
    init?: RequestInit,
    passwordOverride?: string,
    workspaceIdOverride?: string
  ) {
    return fetch("/api/tasks", {
      ...init,
      headers: workspaceHeaders(
        init?.headers,
        passwordOverride,
        workspaceIdOverride
      ),
    });
  }

  function documentRequest(
    init?: RequestInit,
    passwordOverride?: string,
    workspaceIdOverride?: string
  ) {
    return fetch("/api/documents", {
      ...init,
      headers: workspaceHeaders(
        init?.headers,
        passwordOverride,
        workspaceIdOverride
      ),
    });
  }

  function rememberWorkspacePassword(id: string, password: string) {
    setWorkspacePassword(password);
    if (password) {
      window.sessionStorage.setItem(workspacePasswordKey(id), password);
    } else {
      window.sessionStorage.removeItem(workspacePasswordKey(id));
    }
  }

  function rememberRecentWorkspace(id: string) {
    setRecentWorkspaceIds((current) => {
      const next = [id, ...current.filter((workspaceId) => workspaceId !== id)]
        .filter(Boolean)
        .slice(0, 6);
      window.localStorage.setItem(
        RECENT_WORKSPACES_STORAGE_KEY,
        JSON.stringify(next)
      );
      return next;
    });
  }

  async function loadTasks(passwordOverride?: string, workspaceIdOverride?: string) {
    setLoading(true);
    setError("");
    const submittedPassword =
      typeof passwordOverride === "string" ? passwordOverride.trim() : "";
    const targetWorkspaceId = workspaceIdOverride ?? activeWorkspaceId;

    try {
      const response = await taskRequest(
        { cache: "no-store" },
        submittedPassword,
        targetWorkspaceId
      );
      const data = (await response.json()) as TaskResponse;

      if (data.workspaces) {
        setWorkspaces(data.workspaces);
      }

      if (data.workspace) {
        setActiveWorkspace(data.workspace);
        setWorkspaceDepartmentDraft(data.workspace.departmentName);
        setWorkspaceTeamDraft(data.workspace.teamName);
      }

      if (!response.ok) {
        if (data.requiresWorkspacePassword) {
          if (submittedPassword) {
            rememberWorkspacePassword(activeWorkspaceId, "");
            setError("암호가 맞지 않습니다. 다시 입력해 주세요.");
          }
          setWorkspaceLocked(true);
          setItems([]);
          setHistory([]);
          setWorkspacePasswordInput("");
          setActiveWorkspace(data.workspace ?? null);
          return false;
        }
        throw new Error(data.error ?? "진행 목록을 불러오지 못했습니다.");
      }

      if (passwordOverride !== undefined) {
        rememberWorkspacePassword(targetWorkspaceId, submittedPassword);
      }
      setActiveWorkspaceId(targetWorkspaceId);
      rememberRecentWorkspace(data.workspace?.id ?? targetWorkspaceId);
      setWorkspaceLocked(false);
      setItems(data.items ?? []);
      setTemplates(data.templates?.length ? data.templates : defaultTemplates);
      setHistory(data.history ?? []);
      setAssigneeSettings(data.assigneeSettings ?? {});
      setOrganizationName(
        data.settings?.organizationName ??
          workspaceOrganizationName(data.workspace ?? activeWorkspace)
      );
      setBoardTitle(data.settings?.boardTitle ?? defaultSettings.boardTitle);
      setWebhookUrl(data.webhook?.url ?? "");
      setWebhookEnabled(data.webhook?.enabled ?? false);
      setGroupOrder(data.groupOrder ?? []);

      const storedUserName = window.localStorage
        .getItem("team-progress-user-name")
        ?.trim();
      setUserName(storedUserName || data.viewer || "사용자");
    } catch (loadError) {
      setError(
        loadError instanceof Error
          ? loadError.message
          : "진행 목록을 불러오지 못했습니다."
      );
      return false;
    } finally {
      setLoading(false);
    }

    return true;
  }

  useEffect(() => {
    const password = readWorkspacePassword(activeWorkspaceId);
    window.localStorage.setItem(WORKSPACE_STORAGE_KEY, activeWorkspaceId);

    const timer = window.setTimeout(() => {
      setWorkspacePassword(password);
      setWorkspacePasswordInput("");
      void loadTasks(password);
    }, 0);

    return () => window.clearTimeout(timer);
    // Switching workspaces is the only intended trigger; loadTasks changes
    // identity as request-related state changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeWorkspaceId]);

  function saveUserName(value: string) {
    const nextUserName = value.trim() || "사용자";
    setUserName(nextUserName);
    window.localStorage.setItem("team-progress-user-name", nextUserName);
    return nextUserName;
  }

  async function unlockWorkspace(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const password = workspacePasswordInput.trim();
    const ok = await loadTasks(password);
    if (ok) {
      setLandingOpen(false);
    }
  }

  async function createWorkspace(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const year = newWorkspaceDepartment.trim();
    const teamName = newWorkspaceTeam.trim();
    const password = newWorkspacePassword.trim();

    if (!year || !teamName || password.length < 4) {
      setError("연도, 조직/팀 이름, 4자 이상 암호를 입력해 주세요.");
      return;
    }

    const actor = saveUserName(userName);

    setCreatingWorkspace(true);
    setError("");

    try {
      const response = await taskRequest({
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "create-workspace",
          actor,
          departmentName: year,
          teamName,
          newWorkspacePassword: password,
          copyPreviousYear,
          sourceWorkspacePassword: sourceWorkspacePassword.trim(),
        }),
      });
      const data = (await response.json()) as TaskResponse;

      if (!response.ok || !data.workspace) {
        throw new Error(data.error ?? "연도/조직 보드를 만들지 못했습니다.");
      }

      window.localStorage.setItem(WORKSPACE_STORAGE_KEY, data.workspace.id);
      rememberRecentWorkspace(data.workspace.id);
      setWorkspaces(data.workspaces ?? []);
      setActiveWorkspace(data.workspace);
      setActiveWorkspaceId(data.workspace.id);
      setWorkspaceDepartmentDraft(data.workspace.departmentName);
      setWorkspaceTeamDraft(data.workspace.teamName);
      rememberWorkspacePassword(data.workspace.id, password);
      setWorkspaceLocked(false);
      setLandingOpen(false);
      setItems(data.items ?? []);
      setTemplates(data.templates?.length ? data.templates : templates);
      setHistory(data.history ?? []);
      setOrganizationName(
        data.settings?.organizationName ?? workspaceOrganizationName(data.workspace)
      );
      setBoardTitle(data.settings?.boardTitle ?? defaultSettings.boardTitle);
      setGroupOrder(data.groupOrder ?? []);
      setNewWorkspaceDepartment("");
      setNewWorkspaceTeam("");
      setNewWorkspacePassword("");
      setCopyPreviousYear(false);
      setSourceWorkspacePassword("");
    } catch (createError) {
      setError(
        createError instanceof Error
          ? createError.message
          : "연도/조직 보드를 만들지 못했습니다."
      );
    } finally {
      setCreatingWorkspace(false);
    }
  }

  async function saveWorkspaceSettings() {
    const teamName = workspaceTeamDraft.trim();

    if (!teamName) {
      setError("조직/팀 이름을 입력해 주세요.");
      return;
    }

    setSavingWorkspace(true);
    setError("");

    try {
      const response = await taskRequest({
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "update-workspace",
          actor: currentActor,
          departmentName: workspaceDepartmentDraft.trim(),
          teamName,
          newWorkspacePassword: workspacePasswordDraft.trim(),
        }),
      });
      const data = (await response.json()) as TaskResponse;

      if (!response.ok || !data.workspace) {
        throw new Error(data.error ?? "연도/조직 설정을 저장하지 못했습니다.");
      }

      setWorkspaces(data.workspaces ?? workspaces);
      setActiveWorkspace(data.workspace);
      setWorkspaceDepartmentDraft(data.workspace.departmentName);
      setWorkspaceTeamDraft(data.workspace.teamName);
      setOrganizationName(data.settings?.organizationName ?? data.workspace.label);
      if (workspacePasswordDraft.trim()) {
        rememberWorkspacePassword(data.workspace.id, workspacePasswordDraft.trim());
      }
      setWorkspacePasswordDraft("");
      setHistory(data.history ?? history);
    } catch (saveError) {
      setError(
        saveError instanceof Error
          ? saveError.message
          : "연도/조직 설정을 저장하지 못했습니다."
      );
    } finally {
      setSavingWorkspace(false);
    }
  }

  async function saveBoardSettings(nextSettings?: Partial<AppSettings>) {
    const nextOrganizationName = (
      nextSettings?.organizationName ?? organizationName
    ).trim();
    const nextBoardTitle = (nextSettings?.boardTitle ?? boardTitle).trim();

    if (!nextOrganizationName || !nextBoardTitle) {
      setError("조직명과 보드명을 입력해 주세요.");
      return;
    }

    setSavingSettings(true);
    setError("");

    try {
      const response = await taskRequest( {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "update-settings",
          actor: currentActor,
          organizationName: nextOrganizationName,
          boardTitle: nextBoardTitle,
        }),
      });
      const data = (await response.json()) as TaskResponse;

      if (!response.ok || !data.settings) {
        throw new Error(data.error ?? "보드 설정을 저장하지 못했습니다.");
      }

      setOrganizationName(data.settings.organizationName);
      setBoardTitle(data.settings.boardTitle);
      setHistory(data.history ?? history);
    } catch (saveError) {
      setError(
        saveError instanceof Error
          ? saveError.message
          : "보드 설정을 저장하지 못했습니다."
      );
    } finally {
      setSavingSettings(false);
    }
  }

  const assignees = useMemo(
    () =>
      [...new Set(items.map((item) => assigneeName(item.assignee)))].sort(
        (first, second) => first.localeCompare(second, "ko-KR")
      ),
    [items]
  );

  // 대분류/중분류/소분류 경로. 예: "복원사업 > 현장조사 > 식생".
  function groupName(item: WorkflowItem) {
    return categoryKey(item.category);
  }

  function groupContainsCategory(groupKey: string, candidate: string) {
    return candidate === groupKey || candidate.startsWith(`${groupKey} > `);
  }

  const categories = useMemo(() => {
    const names = new Set<string>();

    groupOrder.forEach((name) => names.add(categoryKey(name)));
    items.forEach((item) => names.add(groupName(item)));

    return [...names].sort((first, second) =>
      first.localeCompare(second, "ko-KR")
    );
  }, [groupOrder, items]);

  const orderedCategoryNames = useMemo(() => {
    const names: string[] = [];
    const seen = new Set<string>();
    const pushName = (value: string) => {
      const name = categoryKey(value);
      if (!seen.has(name)) {
        seen.add(name);
        names.push(name);
      }
    };

    groupOrder.forEach(pushName);
    [...items]
      .sort((first, second) => first.position - second.position)
      .forEach((item) => pushName(groupName(item)));
    categories.forEach(pushName);

    return names;
  }, [categories, groupOrder, items]);

  const templatesByKey = useMemo(
    () => new Map(templates.map((template) => [template.key, template])),
    [templates]
  );

  function itemTypeName(item: WorkflowItem) {
    return templatesByKey.get(item.templateKey)?.name ?? "기타 유형";
  }

  const selectedTemplate =
    templateFilter === "all"
      ? null
      : templates.find((template) => template.key === templateFilter) ?? null;

  const baseItems = useMemo(() => {
    const query = deferredKeyword.trim().toLocaleLowerCase("ko-KR");
    const dueRange =
      dueFilter === "week" || dueFilter === "month"
        ? periodRange(dueFilter)
        : null;

    return [...items].filter((item) => {
      if (templateFilter !== "all" && item.templateKey !== templateFilter) {
        return false;
      }

      if (assigneeFilter !== "all" && assigneeName(item.assignee) !== assigneeFilter) {
        return false;
      }

      if (categoryFilter !== "all" && groupName(item) !== categoryFilter) {
        return false;
      }

      if (stageFilter !== "all" && nextStep(item)?.stageKey !== stageFilter) {
        return false;
      }

      if (dueFilter === "urgent" && !itemHasUrgentDate(item)) {
        return false;
      }

      if (dueFilter === "overdue" && !itemHasOverdueDate(item)) {
        return false;
      }

      if (
        dueRange &&
        !itemHasDueInRange(item, dueRange.start, dueRange.end)
      ) {
        return false;
      }

      if (filter === "open" && isItemDone(item)) {
        return false;
      }

      if (filter === "done" && !isItemDone(item)) {
        return false;
      }

      if (query) {
        const haystack = [
          item.title,
          item.category,
          item.assignee,
          item.memo,
          item.contractVendor,
          item.contractManager,
          item.contractPhone,
          ...item.subtasks.map((subtask) => subtask.title),
          ...item.subtasks.map((subtask) => subtask.blockers),
        ]
          .join(" ")
          .toLocaleLowerCase("ko-KR");

        if (!haystack.includes(query)) {
          return false;
        }
      }

      return true;
    });
  }, [
    assigneeFilter,
    categoryFilter,
    dueFilter,
    filter,
    items,
    deferredKeyword,
    stageFilter,
    templateFilter,
  ]);

  const visibleItems = useMemo(() => {
    const next = [...baseItems];

    if (sortMode === "assignee") {
      return next.sort((first, second) => {
        const assigneeCompare = assigneeName(first.assignee).localeCompare(
          assigneeName(second.assignee),
          "ko-KR"
        );

        return assigneeCompare || first.position - second.position;
      });
    }

    if (sortMode === "progress") {
      return next.sort(
        (first, second) =>
          itemProgress(second) - itemProgress(first) ||
          first.position - second.position
      );
    }

    if (sortMode === "updated") {
      return next.sort(
        (first, second) =>
          new Date(second.updatedAt).getTime() -
            new Date(first.updatedAt).getTime() || first.position - second.position
      );
    }

    return next.sort((first, second) => first.position - second.position);
  }, [baseItems, sortMode]);

  // Group the (already filtered/sorted) list by 대분류 for the grouped list view.
  const listGroups = useMemo(() => {
    const groups: Array<{ name: string; items: WorkflowItem[] }> = [];
    const indexByName = new Map<string, number>();
    const includeEmptyGroups =
      categoryFilter === "all" &&
      templateFilter === "all" &&
      assigneeFilter === "all" &&
      stageFilter === "all" &&
      dueFilter === "all" &&
      filter === "all" &&
      !deferredKeyword.trim();
    const seedGroups =
      categoryFilter === "all"
        ? includeEmptyGroups
          ? orderedCategoryNames
          : []
        : [categoryFilter];

    const ensureGroup = (name: string) => {
      const key = categoryKey(name);
      let index = indexByName.get(key);

      if (index === undefined) {
        index = groups.length;
        indexByName.set(key, index);
        groups.push({ name: key, items: [] });
      }

      return index;
    };

    seedGroups.forEach(ensureGroup);

    for (const item of visibleItems) {
      const name = groupName(item);
      const index = ensureGroup(name);

      groups[index].items.push(item);
    }

    // Apply the saved group order; unknown groups keep their appearance order
    // at the end (Array.sort is stable, both map to Infinity).
    const orderIndex = new Map(orderedCategoryNames.map((name, i) => [name, i]));
    groups.sort(
      (first, second) =>
        (orderIndex.get(first.name) ?? Infinity) -
        (orderIndex.get(second.name) ?? Infinity)
    );

    return groups;
  }, [
    assigneeFilter,
    categoryFilter,
    dueFilter,
    filter,
    deferredKeyword,
    orderedCategoryNames,
    stageFilter,
    templateFilter,
    visibleItems,
  ]);

  const stages =
    selectedTemplate?.stages.map((stage) => ({
      stageKey: stage.key,
      title: stage.title,
      description: stage.description,
    })) ??
    visibleItems[0]?.steps ??
    items[0]?.steps ??
    [];

  // Items of different templates have different stage columns, so the grid is
  // rendered as one table per template group. Within a group every item shares
  // the same stage set, keeping header columns aligned with each row's cells.
  const gridGroups = useMemo(() => {
    const groups: Array<{
      templateKey: string;
      templateName: string;
      stages: Array<{ stageKey: string; title: string; description: string }>;
      items: WorkflowItem[];
    }> = [];
    const indexByKey = new Map<string, number>();

    for (const item of visibleItems) {
      let index = indexByKey.get(item.templateKey);

      if (index === undefined) {
        index = groups.length;
        indexByKey.set(item.templateKey, index);
        groups.push({
          templateKey: item.templateKey,
          templateName:
            templates.find((template) => template.key === item.templateKey)
              ?.name ?? "기타 업무",
          stages: item.steps.map((step) => ({
            stageKey: step.stageKey,
            title: step.title,
            description: step.description,
          })),
          items: [],
        });
      }

      groups[index].items.push(item);
    }

    return groups;
  }, [visibleItems, templates]);

  const totalSteps = items.reduce((sum, item) => sum + item.steps.length, 0);
  const completedSteps = items.reduce(
    (sum, item) => sum + completionCount(item),
    0
  );
  const overallProgress = totalSteps
    ? Math.round((completedSteps / totalSteps) * 100)
    : 0;
  const openItemCount = items.filter((item) => !isItemDone(item)).length;

  const bottlenecks = useMemo(() => {
    const counts = new Map<string, { title: string; count: number }>();

    for (const item of items) {
      const step = nextStep(item);

      if (!step) {
        continue;
      }

      const current = counts.get(step.stageKey) ?? { title: step.title, count: 0 };
      current.count += 1;
      counts.set(step.stageKey, current);
    }

    return [...counts.values()].sort((first, second) => second.count - first.count);
  }, [items]);

  const assigneeStats = useMemo(
    () =>
      assignees.map((assignee) => {
        const assignedItems = items.filter(
          (item) => assigneeName(item.assignee) === assignee
        );
        const progress = assignedItems.length
          ? Math.round(
              assignedItems.reduce((sum, item) => sum + itemProgress(item), 0) /
                assignedItems.length
            )
          : 0;

        return { assignee, count: assignedItems.length, progress };
      }),
    [assignees, items]
  );

  const dashboard = useMemo(() => {
    let done = 0;
    let overdue = 0;
    let urgent = 0;
    let inProgress = 0;

    for (const item of items) {
      if (isItemDone(item)) {
        done += 1;
      } else if (itemHasOverdueDate(item)) {
        overdue += 1;
      } else if (itemHasUrgentDate(item)) {
        urgent += 1;
      } else {
        inProgress += 1;
      }
    }

    const total = items.length;
    const safeTotal = total || 1;

    const statusSegments = [
      { key: "done", label: "완료", value: done, color: "var(--complete)" },
      { key: "inProgress", label: "진행", value: inProgress, color: "var(--accent)" },
      { key: "urgent", label: "임박", value: urgent, color: "var(--warning)" },
      { key: "overdue", label: "지연", value: overdue, color: "var(--danger)" },
    ];

    let acc = 0;
    const stops = statusSegments
      .filter((segment) => segment.value > 0)
      .map((segment) => {
        const start = (acc / safeTotal) * 100;
        acc += segment.value;
        const end = (acc / safeTotal) * 100;
        return `${segment.color} ${start}% ${end}%`;
      });
    const conic = stops.length
      ? `conic-gradient(${stops.join(", ")})`
      : "conic-gradient(var(--surface-3) 0% 100%)";

    const typeCounts = new Map<string, number>();
    for (const item of items) {
      typeCounts.set(item.templateKey, (typeCounts.get(item.templateKey) ?? 0) + 1);
    }
    const types = [...typeCounts.entries()]
      .map(([key, count]) => ({
        key,
        name: templatesByKey.get(key)?.name ?? "기타",
        count,
      }))
      .sort((first, second) => second.count - first.count);

    const deadlines: Array<{
      id: string;
      itemId: number;
      title: string;
      label: string;
      date: string;
    }> = [];
    for (const item of items) {
      if (isItemDone(item)) {
        continue;
      }
      const step = nextStep(item);
      if (step?.dueDate) {
        deadlines.push({
          id: `s${step.id}`,
          itemId: item.id,
          title: item.title,
          label: step.title,
          date: step.dueDate,
        });
      } else if (item.dueDate) {
        deadlines.push({
          id: `i${item.id}`,
          itemId: item.id,
          title: item.title,
          label: "최종 마감",
          date: item.dueDate,
        });
      }
    }
    deadlines.sort((first, second) => first.date.localeCompare(second.date));

    const allocated = items.reduce(
      (sum, item) => sum + (item.allocatedBudget ?? 0),
      0
    );
    const required = items.reduce(
      (sum, item) => sum + (item.requiredBudget ?? 0),
      0
    );

    const regionMap = new Map<
      string,
      { count: number; done: number; lat: number | null; lng: number | null }
    >();
    let unlocatedCount = 0;

    for (const item of items) {
      if (!item.location && (item.lat === null || item.lng === null)) {
        unlocatedCount += 1;
        continue;
      }

      const name = item.location || "이름 없는 위치";
      const region = regionMap.get(name) ?? {
        count: 0,
        done: 0,
        lat: null,
        lng: null,
      };
      region.count += 1;
      if (isItemDone(item)) {
        region.done += 1;
      }
      if (region.lat === null && item.lat !== null && item.lng !== null) {
        region.lat = item.lat;
        region.lng = item.lng;
      }
      regionMap.set(name, region);
    }

    const regions = [...regionMap.entries()]
      .map(([name, value]) => ({ name, ...value }))
      .sort((first, second) => second.count - first.count)
      .slice(0, 6);

    return {
      regions,
      unlocatedCount,
      total,
      done,
      overdue,
      urgent,
      inProgress,
      statusSegments,
      conic,
      types,
      deadlines: deadlines.slice(0, 8),
      allocated,
      required,
    };
  }, [items, templatesByKey]);

  const notifications = useMemo(() => {
    type Alert = {
      itemId: number;
      title: string;
      label: string;
      date: string;
      state: ReturnType<typeof urgency>;
    };
    const groups = new Map<string, Alert[]>();

    for (const item of items) {
      if (isItemDone(item)) {
        continue;
      }

      const who = assigneeName(item.assignee);
      const entries: Alert[] = [];
      const step = nextStep(item);

      if (step?.dueDate) {
        const state = urgency(step.dueDate);
        if (state === "overdue" || state === "danger" || state === "warning") {
          entries.push({
            itemId: item.id,
            title: item.title,
            label: step.title,
            date: step.dueDate,
            state,
          });
        }
      }

      if (item.dueDate) {
        const state = urgency(item.dueDate);
        if (state === "overdue" || state === "danger" || state === "warning") {
          entries.push({
            itemId: item.id,
            title: item.title,
            label: "최종 마감",
            date: item.dueDate,
            state,
          });
        }
      }

      if (entries.length) {
        groups.set(who, [...(groups.get(who) ?? []), ...entries]);
      }
    }

    const list = [...groups.entries()]
      .map(([assignee, entries]) => ({
        assignee,
        entries: entries.sort((first, second) =>
          first.date.localeCompare(second.date)
        ),
        overdue: entries.filter((entry) => entry.state === "overdue").length,
      }))
      .sort(
        (first, second) =>
          second.overdue - first.overdue ||
          second.entries.length - first.entries.length
      );

    return {
      list,
      total: list.reduce((sum, group) => sum + group.entries.length, 0),
    };
  }, [items]);

  // Monthly report: everything is derived client-side from loaded items.
  const report = useMemo(() => {
    const month = reportMonth;
    const inMonth = (iso?: string | null) => !!iso && iso.startsWith(month);

    const itemRows = items.map((item) => {
      const done = isItemDone(item);
      const budgetParts = [
        item.allocatedBudget
          ? `편성 ${formatBudget(item.allocatedBudget)}`
          : "",
        item.requiredBudget ? `소요 ${formatBudget(item.requiredBudget)}` : "",
      ].filter(Boolean);

      return {
        item,
        categoryName: categoryPath(item.category)[0] ?? "미분류",
        budgetLabel: budgetParts.join(" / "),
        progress: itemProgress(item),
        done,
        completedSteps: item.steps.filter((step) =>
          inMonth(step.completedAt?.slice(0, 10))
        ).length,
        status: done
          ? "완료"
          : itemHasOverdueDate(item)
            ? "지연"
            : itemHasUrgentDate(item)
              ? "임박"
              : "진행",
      };
    });

    const compareText = (first: string, second: string) =>
      first.localeCompare(second, "ko-KR", {
        numeric: true,
        sensitivity: "base",
      });
    const direction = reportSort.direction === "asc" ? 1 : -1;
    const sortedItemRows = [...itemRows].sort((first, second) => {
      let result = 0;

      if (reportSort.key === "category") {
        result = compareText(first.categoryName, second.categoryName);
      } else if (reportSort.key === "title") {
        result = compareText(first.item.title, second.item.title);
      } else if (reportSort.key === "budget") {
        const firstBudget =
          first.item.allocatedBudget ?? first.item.requiredBudget;
        const secondBudget =
          second.item.allocatedBudget ?? second.item.requiredBudget;

        if (firstBudget == null && secondBudget != null) {
          return 1;
        }
        if (firstBudget != null && secondBudget == null) {
          return -1;
        }
        result =
          (firstBudget ?? 0) - (secondBudget ?? 0) ||
          (first.item.requiredBudget ?? 0) -
            (second.item.requiredBudget ?? 0);
      } else if (reportSort.key === "assignee") {
        result = compareText(
          assigneeName(first.item.assignee),
          assigneeName(second.item.assignee)
        );
      } else if (reportSort.key === "progress") {
        result = first.progress - second.progress;
      } else if (reportSort.key === "dueDate") {
        const firstDue = first.item.dueDate;
        const secondDue = second.item.dueDate;

        if (!firstDue && secondDue) {
          return 1;
        }
        if (firstDue && !secondDue) {
          return -1;
        }
        result = (firstDue ?? "").localeCompare(secondDue ?? "");
      } else if (reportSort.key === "status") {
        result =
          (REPORT_STATUS_ORDER[first.status] ?? 99) -
          (REPORT_STATUS_ORDER[second.status] ?? 99);
      }

      if (result === 0) {
        return (
          first.item.position - second.item.position ||
          first.item.id - second.item.id
        );
      }

      return result * direction;
    });

    const dueRows = itemRows.filter((row) => inMonth(row.item.dueDate));
    const assignees = [
      ...new Set(itemRows.map((row) => assigneeName(row.item.assignee))),
    ];
    const assigneeRows = assignees
      .map((assignee) => {
        const rows = itemRows.filter(
          (row) => assigneeName(row.item.assignee) === assignee
        );

        return {
          assignee,
          count: rows.length,
          avgProgress: Math.round(
            rows.reduce((sum, row) => sum + row.progress, 0) / rows.length
          ),
          completedSteps: rows.reduce(
            (sum, row) => sum + row.completedSteps,
            0
          ),
        };
      })
      .sort((first, second) => second.count - first.count);

    return {
      month,
      stepsCompletedInMonth: itemRows.reduce(
        (sum, row) => sum + row.completedSteps,
        0
      ),
      dueInMonth: dueRows.length,
      dueInMonthDone: dueRows.filter((row) => row.done).length,
      createdInMonth: itemRows.filter((row) =>
        inMonth(row.item.createdAt.slice(0, 10))
      ).length,
      overdueNow: itemRows.filter((row) => row.status === "지연").length,
      statusCounts: (
        [
          ["완료", COMPLETE_COLOR],
          ["진행", "#18786f"],
          ["임박", "#d97706"],
          ["지연", "#dc2626"],
        ] as const
      ).map(([label, color]) => ({
        label,
        color,
        value: itemRows.filter((row) => row.status === label).length,
      })),
      assigneeRows,
      itemRows: sortedItemRows,
    };
  }, [items, reportMonth, reportSort.direction, reportSort.key]);

  function toggleReportSort(key: ReportSortKey) {
    setReportSort((current) =>
      current.key === key
        ? {
            key,
            direction: current.direction === "asc" ? "desc" : "asc",
          }
        : { key, direction: "asc" }
    );
  }

  function reportSortButton(key: ReportSortKey, label: string, align = "left") {
    const active = reportSort.key === key;
    const symbol = active ? (reportSort.direction === "asc" ? "↑" : "↓") : "↕";

    return (
      <button
        type="button"
        onClick={() => toggleReportSort(key)}
        className={`inline-flex items-center gap-1 whitespace-nowrap font-semibold ${
          align === "right" ? "ml-auto" : ""
        }`}
        title={`${label} 기준 정렬`}
      >
        <span>{label}</span>
        <span
          className={
            active ? "text-[var(--accent)]" : "text-[var(--text-faint)]"
          }
        >
          {symbol}
        </span>
      </button>
    );
  }

  function downloadReportCsv() {
    const rows: string[][] = [
      [`업무 보고서`, `${report.month}`, organizationName, boardTitle],
      [],
      ["요약"],
      ["이번 달 완료 단계", String(report.stepsCompletedInMonth)],
      [
        "이번 달 마감 업무",
        `${report.dueInMonthDone}/${report.dueInMonth} 완료`,
      ],
      ["이번 달 신규 업무", String(report.createdInMonth)],
      ["현재 지연 업무", String(report.overdueNow)],
      [],
      ["대분류", "업무명", "예산", "담당", "진행률(%)", "마감일", "상태"],
      ...report.itemRows.map((row) => [
        row.categoryName,
        row.item.title,
        row.budgetLabel,
        assigneeName(row.item.assignee),
        String(row.progress),
        row.item.dueDate ?? "",
        row.status,
      ]),
    ];
    const escapeCell = (value: string) =>
      /[",\n]/.test(value) ? `"${value.replaceAll('"', '""')}"` : value;
    // UTF-8 BOM so Excel opens Korean text correctly.
    const csv =
      "﻿" + rows.map((row) => row.map(escapeCell).join(",")).join("\r\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `업무보고서_${report.month}.csv`;
    link.click();
    URL.revokeObjectURL(link.href);
  }

  function printReport() {
    document.body.classList.add("tb-printing-report");

    const cleanup = () => {
      document.body.classList.remove("tb-printing-report");
      window.removeEventListener("afterprint", cleanup);
    };

    window.addEventListener("afterprint", cleanup);
    window.setTimeout(() => {
      window.print();
      window.setTimeout(cleanup, 1000);
    }, 0);
  }

  // Date-axis timeline for the gantt view: range spans every known date
  // (creation, item due, step due) plus today, with light padding.
  const gantt = useMemo(() => {
    const DAY = 86_400_000;
    const parse = (iso: string) => new Date(`${iso}T00:00:00`).getTime();
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayMs = today.getTime();

    let min = Infinity;
    let max = -Infinity;

    for (const item of visibleItems) {
      min = Math.min(min, parse(item.createdAt.slice(0, 10)));
      if (item.dueDate) {
        const due = parse(item.dueDate);
        min = Math.min(min, due);
        max = Math.max(max, due);
      }
      for (const step of item.steps) {
        if (step.dueDate) {
          const due = parse(step.dueDate);
          min = Math.min(min, due);
          max = Math.max(max, due);
        }
      }
    }

    if (!Number.isFinite(min)) {
      min = todayMs - 7 * DAY;
    }
    if (max === -Infinity) {
      max = todayMs + 21 * DAY;
    }
    min = Math.min(min, todayMs) - 2 * DAY;
    max = Math.max(max, todayMs) + 3 * DAY;
    if (max - min < 14 * DAY) {
      max = min + 14 * DAY;
    }

    const span = max - min;
    const pct = (ms: number) => ((ms - min) / span) * 100;
    const tickCount = 6;
    const ticks = Array.from({ length: tickCount + 1 }, (_, index) => {
      const ms = min + (span * index) / tickCount;
      const date = new Date(ms);
      return {
        pct: (index / tickCount) * 100,
        label: `${date.getMonth() + 1}.${String(date.getDate()).padStart(2, "0")}`,
      };
    });

    const rows = visibleItems.map((item) => {
      const created = parse(item.createdAt.slice(0, 10));
      const stepDues = item.steps
        .filter((step) => step.dueDate)
        .map((step) => parse(step.dueDate as string));
      const end = item.dueDate
        ? parse(item.dueDate)
        : stepDues.length
          ? Math.max(...stepDues)
          : null;
      const start = Math.min(created, end ?? created);
      const markers = item.steps
        .filter((step) => step.dueDate)
        .map((step) => ({
          id: step.id,
          pct: pct(parse(step.dueDate as string)),
          done: step.status === "done",
          title: `${step.title} · ${step.dueDate}`,
        }));

      return {
        item,
        startPct: pct(start),
        endPct: end !== null ? pct(end) : null,
        markers,
      };
    });

    return { ticks, todayPct: pct(todayMs), rows, min, span };
  }, [visibleItems]);

  function replaceItem(nextItem: WorkflowItem) {
    setItems((current) =>
      current.map((item) => (item.id === nextItem.id ? nextItem : item))
    );
  }

  function updateLocalItem(
    id: number,
    patch: Partial<
      Pick<
        WorkflowItem,
        | "title"
        | "assignee"
        | "category"
        | "memo"
        | "allocatedBudget"
        | "requiredBudget"
        | "contractVendor"
        | "contractManager"
        | "contractPhone"
        | "contractAmount"
        | "dueDate"
        | "location"
        | "lat"
        | "lng"
        | "links"
      >
    >
  ) {
    setItems((current) =>
      current.map((item) => (item.id === id ? { ...item, ...patch } : item))
    );
  }

  function updateLocalSubtask(
    subtaskId: number,
    patch: Partial<
      Pick<WorkflowSubtask, "title" | "status" | "dueDate" | "blockers">
    >
  ) {
    setItems((current) =>
      current.map((item) => ({
        ...item,
        subtasks: item.subtasks.map((subtask) =>
          subtask.id === subtaskId ? { ...subtask, ...patch } : subtask
        ),
      }))
    );
  }

  async function updateItem(
    id: number,
    patch: Partial<
      Pick<
        WorkflowItem,
        | "title"
        | "assignee"
        | "category"
        | "memo"
        | "allocatedBudget"
        | "requiredBudget"
        | "contractVendor"
        | "contractManager"
        | "contractPhone"
        | "contractAmount"
        | "dueDate"
        | "location"
        | "lat"
        | "lng"
        | "links"
      >
    >
  ) {
    const previousItems = items;
    setError("");
    setSavingItemIds((current) => new Set(current).add(id));

    try {
      const response = await taskRequest( {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ itemId: id, actor: currentActor, ...patch }),
      });
      const data = (await response.json()) as TaskResponse;

      if (!response.ok || !data.item) {
        throw new Error(data.error ?? "업무 정보를 저장하지 못했습니다.");
      }

      replaceItem(data.item);
      setAssigneeSettings((current) => data.assigneeSettings ?? current);
      setHistory(data.history ?? history);
    } catch (saveError) {
      setItems(previousItems);
      setError(
        saveError instanceof Error
          ? saveError.message
          : "업무 정보를 저장하지 못했습니다."
      );
    } finally {
      setSavingItemIds((current) => {
        const next = new Set(current);
        next.delete(id);
        return next;
      });
    }
  }

  async function clearMapPin(item: WorkflowItem) {
    if (item.lat === null && item.lng === null) {
      return;
    }

    if (
      !window.confirm(
        `'${item.title || "제목 없음"}' 업무의 지도 핀을 삭제할까요? 업무 자체는 삭제되지 않습니다.`
      )
    ) {
      return;
    }

    setPlacingItemId((current) => (current === item.id ? null : current));
    updateLocalItem(item.id, { lat: null, lng: null });
    await updateItem(item.id, { lat: null, lng: null });
  }

  async function deleteItem(item: WorkflowItem) {
    if (!window.confirm(`'${item.title}' 업무를 삭제할까요?`)) {
      return;
    }

    const previousItems = items;
    setError("");
    setDeletingItemIds((current) => new Set(current).add(item.id));
    setItems((current) => current.filter((currentItem) => currentItem.id !== item.id));
    setExpandedIds((current) => {
      const next = new Set(current);
      next.delete(item.id);
      return next;
    });

    try {
      const response = await taskRequest( {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ itemId: item.id, actor: currentActor }),
      });
      const data = (await response.json()) as TaskResponse;

      if (!response.ok || !data.items) {
        throw new Error(data.error ?? "업무를 삭제하지 못했습니다.");
      }

      setItems(data.items);
      setHistory(data.history ?? history);
      setSubtaskDrafts((current) => {
        const next = { ...current };
        delete next[item.id];
        return next;
      });
    } catch (deleteError) {
      setItems(previousItems);
      setError(
        deleteError instanceof Error
          ? deleteError.message
          : "업무를 삭제하지 못했습니다."
      );
    } finally {
      setDeletingItemIds((current) => {
        const next = new Set(current);
        next.delete(item.id);
        return next;
      });
    }
  }

  async function updateStep(
    item: WorkflowItem,
    step: WorkflowStep,
    status: StepStatus
  ) {
    const previousItems = items;
    setError("");
    setSavingStepIds((current) => new Set(current).add(step.id));
    setItems((current) =>
      current.map((currentItem) =>
        currentItem.id === item.id
          ? {
              ...currentItem,
              steps: currentItem.steps.map((currentStep) =>
                currentStep.id === step.id ? { ...currentStep, status } : currentStep
              ),
            }
          : currentItem
      )
    );

    try {
      const response = await taskRequest( {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ stepId: step.id, actor: currentActor, status }),
      });
      const data = (await response.json()) as TaskResponse;

      if (!response.ok || !data.item) {
        throw new Error(data.error ?? "진도 상태를 저장하지 못했습니다.");
      }

      replaceItem(data.item);
      setHistory(data.history ?? history);
    } catch (saveError) {
      setItems(previousItems);
      setError(
        saveError instanceof Error
          ? saveError.message
          : "진도 상태를 저장하지 못했습니다."
      );
    } finally {
      setSavingStepIds((current) => {
        const next = new Set(current);
        next.delete(step.id);
        return next;
      });
    }
  }

  async function updateStepDueDate(step: WorkflowStep, dueDate: string) {
    setSavingStepIds((current) => new Set(current).add(step.id));
    setError("");

    try {
      const response = await taskRequest( {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ stepId: step.id, actor: currentActor, dueDate }),
      });
      const data = (await response.json()) as TaskResponse;

      if (!response.ok || !data.item) {
        throw new Error(data.error ?? "목표일을 저장하지 못했습니다.");
      }

      replaceItem(data.item);
      setHistory(data.history ?? history);
    } catch (saveError) {
      setError(
        saveError instanceof Error
          ? saveError.message
          : "목표일을 저장하지 못했습니다."
      );
    } finally {
      setSavingStepIds((current) => {
        const next = new Set(current);
        next.delete(step.id);
        return next;
      });
    }
  }

  async function updateSubtask(
    subtaskId: number,
    patch: Partial<
      Pick<WorkflowSubtask, "title" | "status" | "dueDate" | "blockers">
    >
  ) {
    const previousItems = items;
    setError("");
    setSavingSubtaskIds((current) => new Set(current).add(subtaskId));

    try {
      const response = await taskRequest( {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subtaskId, actor: currentActor, ...patch }),
      });
      const data = (await response.json()) as TaskResponse;

      if (!response.ok || !data.item) {
        throw new Error(data.error ?? "세부 체크리스트를 저장하지 못했습니다.");
      }

      replaceItem(data.item);
      setHistory(data.history ?? history);
    } catch (saveError) {
      setItems(previousItems);
      setError(
        saveError instanceof Error
          ? saveError.message
          : "세부 체크리스트를 저장하지 못했습니다."
      );
    } finally {
      setSavingSubtaskIds((current) => {
        const next = new Set(current);
        next.delete(subtaskId);
        return next;
      });
    }
  }

  async function addSubtask(itemId: number) {
    const draft = subtaskDrafts[itemId] ?? {
      title: "",
      dueDate: "",
      blockers: "",
    };
    const title = draft.title.trim();

    if (!title) {
      return;
    }

    setError("");

    try {
      const response = await taskRequest( {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "create-subtask",
          actor: currentActor,
          itemId,
          title,
          dueDate: draft.dueDate,
          blockers: draft.blockers,
        }),
      });
      const data = (await response.json()) as TaskResponse;

      if (!response.ok || !data.item) {
        throw new Error(data.error ?? "세부 체크리스트를 추가하지 못했습니다.");
      }

      replaceItem(data.item);
      setSubtaskDrafts((current) => ({
        ...current,
        [itemId]: { title: "", dueDate: "", blockers: "" },
      }));
      setHistory(data.history ?? history);
    } catch (addError) {
      setError(
        addError instanceof Error
          ? addError.message
          : "세부 체크리스트를 추가하지 못했습니다."
      );
    }
  }

  // Add a checklist item scoped to a single stage (step) of a task.
  async function addStepSubtask(itemId: number, stepId: number) {
    const title = (stepDrafts[stepId] ?? "").trim();

    if (!title) {
      return;
    }

    setError("");

    try {
      const response = await taskRequest( {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "create-subtask",
          actor: currentActor,
          itemId,
          stepId,
          title,
        }),
      });
      const data = (await response.json()) as TaskResponse;

      if (!response.ok || !data.item) {
        throw new Error(data.error ?? "세부 체크리스트를 추가하지 못했습니다.");
      }

      replaceItem(data.item);
      setStepDrafts((current) => ({ ...current, [stepId]: "" }));
      setHistory(data.history ?? history);
    } catch (addError) {
      setError(
        addError instanceof Error
          ? addError.message
          : "세부 체크리스트를 추가하지 못했습니다."
      );
    }
  }

  async function deleteSubtask(subtask: WorkflowSubtask) {
    const previousItems = items;
    setError("");
    setItems((current) =>
      current.map((item) =>
        item.id === subtask.itemId
          ? {
              ...item,
              subtasks: item.subtasks.filter(
                (candidate) => candidate.id !== subtask.id
              ),
            }
          : item
      )
    );

    try {
      const response = await taskRequest( {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subtaskId: subtask.id, actor: currentActor }),
      });
      const data = (await response.json()) as TaskResponse;

      if (!response.ok || !data.item) {
        throw new Error(data.error ?? "세부 체크리스트를 삭제하지 못했습니다.");
      }

      replaceItem(data.item);
      setHistory(data.history ?? history);
    } catch (deleteError) {
      setItems(previousItems);
      setError(
        deleteError instanceof Error
          ? deleteError.message
          : "세부 체크리스트를 삭제하지 못했습니다."
      );
    }
  }

  function toggleStepExpanded(stepId: number) {
    setExpandedStepIds((current) => {
      const next = new Set(current);
      if (next.has(stepId)) {
        next.delete(stepId);
      } else {
        next.add(stepId);
      }
      return next;
    });
  }

  async function addItem(
    event: FormEvent<HTMLFormElement>,
    categoryOverride?: string
  ) {
    event.preventDefault();
    const title = newTitle.trim();
    const category = categoryOverride ?? newGroup;

    if (!title) {
      return;
    }

    setAdding(true);
    setError("");

    try {
      const response = await taskRequest( {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title,
          actor: currentActor,
          category,
          assignee: newAssignee,
          memo: newMemo,
          allocatedBudget: newAllocatedBudget,
          requiredBudget: newRequiredBudget,
          dueDate: newDueDate,
          templateKey: newTemplateKey,
        }),
      });
      const data = (await response.json()) as TaskResponse;

      if (!response.ok || !data.item) {
        throw new Error(data.error ?? "업무를 추가하지 못했습니다.");
      }

      setItems((current) => [...current, data.item!]);
      setNewTitle("");
      setNewAssignee("");
      setNewMemo("");
      setNewAllocatedBudget("");
      setNewRequiredBudget("");
      setNewDueDate("");
      setSortMode("manual");
      setHistory(data.history ?? history);
      if (categoryOverride !== undefined && data.item) {
        const nextGroup = groupName(data.item);
        setActiveAddGroup(nextGroup);
        setNewGroup(nextGroup === categoryKey("") ? "" : nextGroup);
        setCollapsedGroups((current) => {
          const nextSet = new Set(current);
          nextSet.delete(nextGroup);
          return nextSet;
        });
        window.setTimeout(() => {
          const titleInput = document.getElementById("new-task-title");
          titleInput?.focus();
        }, 0);
      }
    } catch (addError) {
      setError(
        addError instanceof Error ? addError.message : "업무를 추가하지 못했습니다."
      );
    } finally {
      setAdding(false);
    }
  }

  async function saveAssigneeColor(assignee: string, color: string) {
    setError("");

    try {
      const response = await taskRequest( {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "set-assignee-color",
          actor: currentActor,
          assignee,
          color,
        }),
      });
      const data = (await response.json()) as TaskResponse;

      if (!response.ok || !data.assigneeSettings) {
        throw new Error(data.error ?? "담당자 색상을 저장하지 못했습니다.");
      }

      setAssigneeSettings(data.assigneeSettings);
      setHistory(data.history ?? history);
    } catch (saveError) {
      setError(
        saveError instanceof Error
          ? saveError.message
          : "담당자 색상을 저장하지 못했습니다."
      );
    }
  }

  async function duplicateItem(item: WorkflowItem, keepSchedule: boolean) {
    setError("");
    setDuplicateTarget(null);
    setSavingItemIds((current) => new Set(current).add(item.id));

    try {
      const response = await taskRequest( {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "duplicate-item",
          actor: currentActor,
          itemId: item.id,
          keepSchedule,
        }),
      });
      const data = (await response.json()) as TaskResponse;

      if (!response.ok || !data.item) {
        throw new Error(data.error ?? "업무를 복제하지 못했습니다.");
      }

      setItems((current) => [...current, data.item!]);
      setHistory(data.history ?? history);
      openItem(data.item.id);
    } catch (duplicateError) {
      setError(
        duplicateError instanceof Error
          ? duplicateError.message
          : "업무를 복제하지 못했습니다."
      );
    } finally {
      setSavingItemIds((current) => {
        const next = new Set(current);
        next.delete(item.id);
        return next;
      });
    }
  }

  async function openDocuments() {
    setDocsOpen(true);
    setDocsLoading(true);
    setError("");

    try {
      const response = await documentRequest();
      const data = (await response.json()) as {
        documents?: DocumentTemplate[];
        error?: string;
      };

      if (!response.ok || !data.documents) {
        throw new Error(data.error ?? "양식 목록을 불러오지 못했습니다.");
      }

      setDocuments(data.documents);
    } catch (loadError) {
      setError(
        loadError instanceof Error
          ? loadError.message
          : "양식 목록을 불러오지 못했습니다."
      );
    } finally {
      setDocsLoading(false);
    }
  }

  async function uploadDocument() {
    if (!docFile) {
      setError("업로드할 파일을 선택해 주세요.");
      return;
    }

    setUploadingDoc(true);
    setError("");

    try {
      const form = new FormData();
      form.append("file", docFile);
      form.append("name", docName.trim() || docFile.name);
      form.append("actor", currentActor);

      const response = await documentRequest( {
        method: "POST",
        body: form,
      });
      const data = (await response.json()) as {
        documents?: DocumentTemplate[];
        error?: string;
      };

      if (!response.ok || !data.documents) {
        throw new Error(data.error ?? "양식을 업로드하지 못했습니다.");
      }

      setDocuments(data.documents);
      setDocName("");
      setDocFile(null);
    } catch (uploadError) {
      setError(
        uploadError instanceof Error
          ? uploadError.message
          : "양식을 업로드하지 못했습니다."
      );
    } finally {
      setUploadingDoc(false);
    }
  }

  async function deleteDocument(document: DocumentTemplate) {
    if (!window.confirm(`'${document.name}' 양식을 삭제할까요?`)) {
      return;
    }

    setError("");

    try {
      const response = await documentRequest( {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: document.id, actor: currentActor }),
      });
      const data = (await response.json()) as {
        documents?: DocumentTemplate[];
        error?: string;
      };

      if (!response.ok || !data.documents) {
        throw new Error(data.error ?? "양식을 삭제하지 못했습니다.");
      }

      setDocuments(data.documents);
    } catch (deleteError) {
      setError(
        deleteError instanceof Error
          ? deleteError.message
          : "양식을 삭제하지 못했습니다."
      );
    }
  }

  async function downloadDocument(doc: DocumentTemplate) {
    setError("");

    try {
      const downloadResponse = await fetch(`/api/documents?id=${doc.id}`, {
        headers: workspaceHeaders({
          Accept: doc.mimeType || "application/octet-stream",
        }),
      });

      if (!downloadResponse.ok) {
        let message = "양식을 내려받지 못했습니다.";
        try {
          const data = (await downloadResponse.json()) as { error?: string };
          message = data.error ?? message;
        } catch {
          // The response may be a non-JSON error page.
        }
        throw new Error(message);
      }

      const blob = await downloadResponse.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = doc.filename;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    } catch (downloadError) {
      setError(
        downloadError instanceof Error
          ? downloadError.message
          : "양식을 내려받지 못했습니다."
      );
    }
  }

  async function saveWebhook(nextUrl: string, nextEnabled: boolean) {
    setSavingWebhook(true);
    setError("");

    try {
      const response = await taskRequest( {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "save-webhook",
          actor: currentActor,
          url: nextUrl,
          enabled: nextEnabled,
        }),
      });
      const data = (await response.json()) as TaskResponse;

      if (!response.ok || !data.webhook) {
        throw new Error(data.error ?? "웹훅 설정을 저장하지 못했습니다.");
      }

      setWebhookUrl(data.webhook.url);
      setWebhookEnabled(data.webhook.enabled);
      setHistory(data.history ?? history);
    } catch (saveError) {
      setError(
        saveError instanceof Error
          ? saveError.message
          : "웹훅 설정을 저장하지 못했습니다."
      );
    } finally {
      setSavingWebhook(false);
    }
  }

  async function sendDeadlineAlerts() {
    setSendingAlerts(true);
    setAlertResult("");
    setError("");

    try {
      const response = await taskRequest( {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "send-deadline-alerts",
          actor: currentActor,
        }),
      });
      const data = (await response.json()) as TaskResponse;

      if (!response.ok) {
        throw new Error(data.error ?? "알림을 발송하지 못했습니다.");
      }

      setAlertResult(
        data.sent ? `✅ ${data.sent}건 발송 완료` : "보낼 임박·지연 알림이 없습니다."
      );
      setHistory(data.history ?? history);
    } catch (sendError) {
      setAlertResult(
        `⚠️ ${sendError instanceof Error ? sendError.message : "알림을 발송하지 못했습니다."}`
      );
    } finally {
      setSendingAlerts(false);
    }
  }

  async function searchMapPlaces(event?: FormEvent<HTMLFormElement>) {
    event?.preventDefault();
    const query = mapSearchQuery.trim();

    if (!query) {
      setMapSearchResults([]);
      setMapSearchError("");
      return;
    }

    setMapSearching(true);
    setMapSearchError("");

    try {
      const localResults: MapSearchResult[] = WETLAND_PRESETS.filter((preset) =>
        preset.name.toLocaleLowerCase("ko-KR").includes(
          query.toLocaleLowerCase("ko-KR")
        )
      )
        .slice(0, 5)
        .map((preset) => ({
          label: preset.name,
          lat: preset.lat,
          lng: preset.lng,
          source: "기본 목록",
        }));
      let remoteResults: MapSearchResult[] = [];

      if (vworldMapKey.trim()) {
        type VWorldSearchItem = {
          title?: string;
          address?: { parcel?: string; road?: string };
          point?: { x?: string; y?: string };
        };
        const params = new URLSearchParams({
          service: "search",
          request: "search",
          version: "2.0",
          crs: "EPSG:4326",
          size: "5",
          page: "1",
          type: "PLACE",
          format: "json",
          key: vworldMapKey.trim(),
          query,
        });
        const response = await fetch(
          `https://api.vworld.kr/req/search?${params.toString()}`
        );
        const data = (await response.json()) as {
          response?: { result?: { items?: VWorldSearchItem[] } };
        };
        remoteResults =
          data.response?.result?.items
            ?.map((item) => {
              const lat = Number(item.point?.y);
              const lng = Number(item.point?.x);

              if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
                return null;
              }

              return {
                label:
                  item.title ??
                  item.address?.road ??
                  item.address?.parcel ??
                  query,
                lat,
                lng,
                source: "VWorld",
              };
            })
            .filter((item): item is MapSearchResult => item !== null) ?? [];
      } else {
        type NominatimItem = {
          display_name?: string;
          lat?: string;
          lon?: string;
        };
        const params = new URLSearchParams({
          format: "jsonv2",
          q: query,
          limit: "5",
          countrycodes: "kr",
          "accept-language": "ko",
        });
        const response = await fetch(
          `https://nominatim.openstreetmap.org/search?${params.toString()}`
        );
        const data = (await response.json()) as NominatimItem[];
        remoteResults = data
          .map((item) => {
            const lat = Number(item.lat);
            const lng = Number(item.lon);

            if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
              return null;
            }

            return {
              label: item.display_name ?? query,
              lat,
              lng,
              source: "OSM",
            };
          })
          .filter((item): item is MapSearchResult => item !== null);
      }

      const unique = new Map<string, MapSearchResult>();
      [...localResults, ...remoteResults].forEach((result) => {
        unique.set(`${result.lat.toFixed(5)},${result.lng.toFixed(5)}`, result);
      });
      const results = [...unique.values()].slice(0, 8);
      setMapSearchResults(results);
      if (!results.length) {
        setMapSearchError("검색 결과가 없습니다.");
      }
    } catch (searchError) {
      setMapSearchError(
        searchError instanceof Error
          ? searchError.message
          : "지명을 검색하지 못했습니다."
      );
    } finally {
      setMapSearching(false);
    }
  }

  async function createItemOnMap() {
    if (!mapDraft) {
      return;
    }

    const title = mapNewTitle.trim();

    if (!title) {
      setError("업무명을 입력해 주세요.");
      return;
    }

    setAdding(true);
    setError("");

    try {
      const response = await taskRequest( {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title,
          actor: currentActor,
          category: newGroup,
          assignee: mapNewAssignee,
          templateKey: newTemplateKey,
          location: mapNewLocation.trim(),
          lat: mapDraft.lat,
          lng: mapDraft.lng,
        }),
      });
      const data = (await response.json()) as TaskResponse;

      if (!response.ok || !data.item) {
        throw new Error(data.error ?? "업무를 추가하지 못했습니다.");
      }

      setItems((current) => [...current, data.item!]);
      setHistory(data.history ?? history);
      setMapDraft(null);
      setMapNewTitle("");
      setMapNewAssignee("");
      setMapNewLocation("");
    } catch (addError) {
      setError(
        addError instanceof Error ? addError.message : "업무를 추가하지 못했습니다."
      );
    } finally {
      setAdding(false);
    }
  }

  function openTemplateEditor(template: TemplateOption | null) {
    setError("");
    setTemplateDraft(
      template
        ? {
            key: template.key,
            name: template.name,
            stages: template.stages.map((stage) => ({
              stageKey: stage.key,
              title: stage.title,
              group: stage.group,
            })),
          }
        : {
            key: null,
            name: "",
            stages: [{ stageKey: null, title: "", group: "" }],
          }
    );
    setTemplateEditorOpen(true);
  }

  async function saveTemplateDraft() {
    if (!templateDraft) {
      return;
    }

    const name = templateDraft.name.trim();
    const stages = templateDraft.stages
      .map((stage) => ({
        stageKey: stage.stageKey,
        title: stage.title.trim(),
        group: stage.group.trim(),
      }))
      .filter((stage) => stage.title);

    if (!name) {
      setError("유형 이름을 입력해 주세요.");
      return;
    }

    if (!stages.length) {
      setError("최소 한 개 이상의 단계가 필요합니다.");
      return;
    }

    setSavingTemplate(true);
    setError("");

    try {
      const response = await taskRequest( {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "save-template",
          actor: currentActor,
          templateKey: templateDraft.key ?? undefined,
          name,
          stages,
        }),
      });
      const data = (await response.json()) as TaskResponse;

      if (!response.ok || !data.templates) {
        throw new Error(data.error ?? "유형을 저장하지 못했습니다.");
      }

      // A brand-new preset becomes the add-form's selected type so the next
      // task starts from it right away.
      if (!templateDraft.key) {
        const previousKeys = new Set(templates.map((template) => template.key));
        const created = data.templates.find(
          (template) => !previousKeys.has(template.key)
        );
        if (created) {
          setNewTemplateKey(created.key);
        }
      }

      setTemplates(data.templates);
      if (data.items) {
        setItems(data.items);
      }
      setHistory(data.history ?? history);
      setTemplateEditorOpen(false);
      setTemplateDraft(null);
    } catch (saveError) {
      setError(
        saveError instanceof Error ? saveError.message : "유형을 저장하지 못했습니다."
      );
    } finally {
      setSavingTemplate(false);
    }
  }

  async function deleteTemplateByKey(key: string, name: string) {
    if (!window.confirm(`'${name}' 유형을 삭제할까요?`)) {
      return;
    }

    setSavingTemplate(true);
    setError("");

    try {
      const response = await taskRequest( {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "delete-template",
          actor: currentActor,
          templateKey: key,
        }),
      });
      const data = (await response.json()) as TaskResponse;

      if (!response.ok || !data.templates) {
        throw new Error(data.error ?? "유형을 삭제하지 못했습니다.");
      }

      setTemplates(data.templates);
      if (data.items) {
        setItems(data.items);
      }
      setHistory(data.history ?? history);
      setTemplateEditorOpen(false);
      setTemplateDraft(null);
    } catch (deleteError) {
      setError(
        deleteError instanceof Error
          ? deleteError.message
          : "유형을 삭제하지 못했습니다."
      );
    } finally {
      setSavingTemplate(false);
    }
  }

  async function changeItemTemplate(itemId: number, templateKey: string) {
    setError("");
    setSavingItemIds((current) => new Set(current).add(itemId));

    try {
      const response = await taskRequest( {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "set-item-template",
          actor: currentActor,
          itemId,
          templateKey,
        }),
      });
      const data = (await response.json()) as TaskResponse;

      if (!response.ok || !data.item) {
        throw new Error(data.error ?? "업무 유형을 변경하지 못했습니다.");
      }

      replaceItem(data.item);
      setHistory(data.history ?? history);
    } catch (changeError) {
      setError(
        changeError instanceof Error
          ? changeError.message
          : "업무 유형을 변경하지 못했습니다."
      );
    } finally {
      setSavingItemIds((current) => {
        const next = new Set(current);
        next.delete(itemId);
        return next;
      });
    }
  }

  function orderedItemIds() {
    return [...items]
      .sort((first, second) => first.position - second.position)
      .map((item) => item.id);
  }

  function applyOptimisticOrder(
    order: number[],
    movedItemId?: number,
    category?: string
  ) {
    const positionById = new Map(order.map((id, index) => [id, index + 1]));
    setItems((current) =>
      current.map((item) => ({
        ...item,
        category:
          movedItemId === item.id && category !== undefined
            ? category
            : item.category,
        position: positionById.get(item.id) ?? item.position,
      }))
    );
  }

  async function persistItemMove(
    itemId: number,
    category: string,
    order: number[]
  ) {
    const previousItems = items;
    setError("");
    setSavingOrder(true);
    setSortMode("manual");
    applyOptimisticOrder(order, itemId, category);

    try {
      const response = await taskRequest( {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "move-item",
          actor: currentActor,
          itemId,
          category,
          order,
        }),
      });
      const data = (await response.json()) as TaskResponse;

      if (!response.ok || !data.items) {
        throw new Error(data.error ?? "업무 위치를 저장하지 못했습니다.");
      }

      setItems(data.items);
      setHistory(data.history ?? history);
    } catch (saveError) {
      setItems(previousItems);
      setError(
        saveError instanceof Error
          ? saveError.message
          : "업무 위치를 저장하지 못했습니다."
      );
    } finally {
      setSavingOrder(false);
    }
  }

  function dropEdgeFromEvent(event: DragEvent<HTMLElement>): DropEdge {
    const rect = event.currentTarget.getBoundingClientRect();
    return event.clientY < rect.top + rect.height / 2 ? "before" : "after";
  }

  function updateDropIndicator(next: DropIndicator | null) {
    setDropIndicator((current) => {
      if (!current || !next) {
        return next;
      }

      if (current.kind !== next.kind || current.edge !== next.edge) {
        return next;
      }

      if (current.kind === "item" && next.kind === "item") {
        return current.targetId === next.targetId &&
          current.category === next.category
          ? current
          : next;
      }

      if (current.kind === "group" && next.kind === "group") {
        return current.targetName === next.targetName &&
          current.mode === next.mode
          ? current
          : next;
      }

      return next;
    });
  }

  function moveDraggedItemTo(
    targetCategory: string,
    targetId: number | null,
    edge: DropEdge = "before"
  ) {
    if (!draggedId || draggedId === targetId) {
      setDraggedId(null);
      setDropIndicator(null);
      return;
    }

    const sourceItem = items.find((item) => item.id === draggedId);
    const category = storedCategoryName(targetCategory);
    const orderWithoutSource = orderedItemIds().filter((id) => id !== draggedId);

    if (!sourceItem) {
      setDraggedId(null);
      return;
    }

    let insertIndex = orderWithoutSource.length;
    if (targetId !== null) {
      const targetIndex = orderWithoutSource.indexOf(targetId);
      if (targetIndex >= 0) {
        insertIndex = targetIndex + (edge === "after" ? 1 : 0);
      }
    } else {
      const firstInGroup = [...items]
        .filter(
          (item) =>
            item.id !== draggedId && categoryKey(item.category) === targetCategory
        )
        .sort((first, second) => first.position - second.position)
        .at(0);

      if (firstInGroup) {
        insertIndex = orderWithoutSource.indexOf(firstInGroup.id);
      }
    }

    const fullOrder = [
      ...orderWithoutSource.slice(0, insertIndex),
      draggedId,
      ...orderWithoutSource.slice(insertIndex),
    ];

    setDraggedId(null);
    setDropIndicator(null);
    void persistItemMove(sourceItem.id, category, fullOrder);
  }

  function handleItemDragOver(
    event: DragEvent<HTMLElement>,
    targetId: number,
    targetCategory: string
  ) {
    if (!draggedId || draggedId === targetId) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    event.dataTransfer.dropEffect = "move";
    updateDropIndicator({
      kind: "item",
      targetId,
      category: targetCategory,
      edge: dropEdgeFromEvent(event),
    });
  }

  function handleDrop(
    event: DragEvent<HTMLElement>,
    targetId: number,
    targetCategory?: string
  ) {
    event.preventDefault();
    event.stopPropagation();
    const targetItem = items.find((item) => item.id === targetId);
    const indicator =
      dropIndicator?.kind === "item" && dropIndicator.targetId === targetId
        ? dropIndicator
        : null;
    moveDraggedItemTo(
      targetCategory ?? categoryKey(targetItem?.category ?? ""),
      targetId,
      indicator?.edge ?? dropEdgeFromEvent(event)
    );
  }

  function handleDragOver(event: DragEvent<HTMLElement>) {
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
  }

  async function persistGroupOrder(order: string[]) {
    const previous = groupOrder;
    setGroupOrder(order);
    setError("");

    try {
      const response = await taskRequest( {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "save-group-order",
          actor: currentActor,
          groupOrder: order,
        }),
      });
      const data = (await response.json()) as TaskResponse;

      if (!response.ok || !data.groupOrder) {
        throw new Error(data.error ?? "그룹 순서를 저장하지 못했습니다.");
      }

      setGroupOrder(data.groupOrder);
      return true;
    } catch (saveError) {
      setGroupOrder(previous);
      setError(
        saveError instanceof Error
          ? saveError.message
          : "그룹 순서를 저장하지 못했습니다."
      );
      return false;
    }
  }

  function openGroupTaskForm(groupNameForTask: string) {
    const name = categoryKey(groupNameForTask);
    setActiveAddGroup(name);
    setNewGroup(name === categoryKey("") ? "" : name);
    setSortMode("manual");
    setCollapsedGroups((current) => {
      const nextSet = new Set(current);
      nextSet.delete(name);
      return nextSet;
    });

    window.setTimeout(() => {
      const titleInput = document.getElementById("new-task-title");
      titleInput?.scrollIntoView({ behavior: "smooth", block: "center" });
      titleInput?.focus();
    }, 0);
  }

  async function addGroup(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const name = categoryKey(newCategoryName);

    if (!newCategoryName.trim() || name === categoryKey("")) {
      return;
    }

    if (orderedCategoryNames.includes(name)) {
      setNewCategoryName("");
      setFilter("all");
      setTemplateFilter("all");
      setAssigneeFilter("all");
      setCategoryFilter("all");
      setStageFilter("all");
      setDueFilter("all");
      setKeyword("");
      openGroupTaskForm(name);
      return;
    }

    setSavingGroup(true);
    const saved = await persistGroupOrder([...orderedCategoryNames, name]);
    setSavingGroup(false);

    if (saved) {
      setNewCategoryName("");
      setFilter("all");
      setTemplateFilter("all");
      setAssigneeFilter("all");
      setCategoryFilter("all");
      setStageFilter("all");
      setDueFilter("all");
      setKeyword("");
      openGroupTaskForm(name);
    }
  }

  async function deleteGroup(name: string) {
    const groupKey = categoryKey(name);
    const unclassifiedKey = categoryKey("");
    const affectedCount = items.filter((item) =>
      groupContainsCategory(groupKey, groupName(item))
    ).length;

    if (groupKey === unclassifiedKey && affectedCount > 0) {
      setError(
        "미분류 그룹은 업무가 남아 있으면 삭제할 수 없습니다. 먼저 업무 위계를 지정하거나 업무를 삭제해 주세요."
      );
      return;
    }

    const message = affectedCount
      ? `'${groupKey}' 그룹과 하위 위계를 삭제하고 ${affectedCount}개 업무를 미분류로 이동할까요? 업무 자체는 삭제되지 않습니다.`
      : `'${groupKey}' 빈 그룹을 삭제할까요?`;

    if (!window.confirm(message)) {
      return;
    }

    const previousItems = items;
    const previousGroupOrder = groupOrder;
    const previousCategoryFilter = categoryFilter;
    const previousActiveAddGroup = activeAddGroup;
    const previousCollapsedGroups = collapsedGroups;
    setError("");
    setDeletingGroups((current) => new Set(current).add(groupKey));
    setItems((current) =>
      current.map((item) =>
        groupContainsCategory(groupKey, groupName(item))
          ? { ...item, category: "" }
          : item
      )
    );
    setGroupOrder((current) =>
      current.filter(
        (currentName) => !groupContainsCategory(groupKey, categoryKey(currentName))
      )
    );
    setCollapsedGroups((current) => {
      const next = new Set(current);
      next.delete(groupKey);
      return next;
    });
    if (categoryFilter === groupKey) {
      setCategoryFilter("all");
    }
    if (activeAddGroup === groupKey) {
      setActiveAddGroup(null);
    }

    try {
      const response = await taskRequest( {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "delete-group",
          actor: currentActor,
          groupName: groupKey,
        }),
      });
      const data = (await response.json()) as TaskResponse;

      if (!response.ok || !data.items || !data.groupOrder) {
        throw new Error(data.error ?? "대분류를 삭제하지 못했습니다.");
      }

      setItems(data.items);
      setGroupOrder(data.groupOrder);
      setHistory(data.history ?? history);
    } catch (deleteError) {
      setItems(previousItems);
      setGroupOrder(previousGroupOrder);
      setCategoryFilter(previousCategoryFilter);
      setActiveAddGroup(previousActiveAddGroup);
      setCollapsedGroups(previousCollapsedGroups);
      setError(
        deleteError instanceof Error
          ? deleteError.message
          : "대분류를 삭제하지 못했습니다."
      );
    } finally {
      setDeletingGroups((current) => {
        const next = new Set(current);
        next.delete(groupKey);
        return next;
      });
    }
  }

  async function renameGroup(sourceName: string, nextName: string) {
    const source = categoryKey(sourceName);
    const target = categoryKey(nextName);

    if (!target || target === categoryKey("")) {
      setError("새 대분류명을 입력해 주세요.");
      return;
    }

    if (source === target) {
      setEditingGroup(null);
      return;
    }

    const previousItems = items;
    const previousOrder = groupOrder;
    setSavingGroup(true);
    setError("");
    setItems((current) =>
      current.map((item) => ({
        ...item,
        category: replaceCategoryPrefix(item.category, source, target),
      }))
    );
    setGroupOrder((current) =>
      current.map((name) => replaceCategoryPrefix(name, source, target))
    );

    try {
      const response = await taskRequest( {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "rename-group",
          actor: currentActor,
          groupName: source,
          newGroupName: target,
        }),
      });
      const data = (await response.json()) as TaskResponse;

      if (!response.ok || !data.items || !data.groupOrder) {
        throw new Error(data.error ?? "대분류 이름을 저장하지 못했습니다.");
      }

      setItems(data.items);
      setGroupOrder(data.groupOrder);
      setHistory(data.history ?? history);
      setEditingGroup(null);
      if (categoryFilter === source) {
        setCategoryFilter(target);
      }
      if (activeAddGroup === source) {
        setActiveAddGroup(target);
      }
    } catch (renameError) {
      setItems(previousItems);
      setGroupOrder(previousOrder);
      setError(
        renameError instanceof Error
          ? renameError.message
          : "대분류 이름을 저장하지 못했습니다."
      );
    } finally {
      setSavingGroup(false);
    }
  }

  async function mergeGroups(sourceName: string, targetName: string) {
    const source = categoryKey(sourceName);
    const target = categoryKey(targetName);

    if (source === target) {
      return;
    }

    const previousItems = items;
    const previousOrder = groupOrder;
    setSavingGroup(true);
    setError("");
    setItems((current) =>
      current.map((item) => ({
        ...item,
        category: replaceCategoryPrefix(item.category, source, target),
      }))
    );
    setGroupOrder((current) => {
      const names = current
        .filter((name) => !groupContainsCategory(source, categoryKey(name)))
        .map((name) => replaceCategoryPrefix(name, source, target));
      return names.includes(target) ? names : [...names, target];
    });

    try {
      const response = await taskRequest( {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "merge-group",
          actor: currentActor,
          groupName: source,
          targetGroupName: target,
        }),
      });
      const data = (await response.json()) as TaskResponse;

      if (!response.ok || !data.items || !data.groupOrder) {
        throw new Error(data.error ?? "대분류를 합치지 못했습니다.");
      }

      setItems(data.items);
      setGroupOrder(data.groupOrder);
      setHistory(data.history ?? history);
    } catch (mergeError) {
      setItems(previousItems);
      setGroupOrder(previousOrder);
      setError(
        mergeError instanceof Error
          ? mergeError.message
          : "대분류를 합치지 못했습니다."
      );
    } finally {
      setSavingGroup(false);
    }
  }

  function handleGroupDragOver(
    event: DragEvent<HTMLElement>,
    targetName: string
  ) {
    if (!draggedGroup && !draggedId) {
      return;
    }

    if (draggedGroup === targetName) {
      updateDropIndicator(null);
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    event.dataTransfer.dropEffect = "move";
    updateDropIndicator({
      kind: "group",
      targetName,
      edge: draggedId ? "after" : dropEdgeFromEvent(event),
      mode: draggedId ? "append" : "merge",
    });
  }

  function handleGroupDrop(event: DragEvent<HTMLElement>, targetName: string) {
    event.preventDefault();
    event.stopPropagation();
    const indicator =
      dropIndicator?.kind === "group" && dropIndicator.targetName === targetName
        ? dropIndicator
        : null;
    setDropIndicator(null);

    if (draggedId) {
      moveDraggedItemTo(targetName, null);
      return;
    }

    if (!draggedGroup || draggedGroup === targetName) {
      setDraggedGroup(null);
      return;
    }

    const names = listGroups.map((group) => group.name);
    const from = names.indexOf(draggedGroup);
    const to = names.indexOf(targetName);
    const sourceGroup = draggedGroup;
    const edge = indicator?.edge ?? dropEdgeFromEvent(event);
    setDraggedGroup(null);

    if (from < 0 || to < 0) {
      return;
    }

    if (
      window.confirm(
        `'${sourceGroup}' 대분류를 '${targetName}' 대분류로 합칠까요?\n확인: 합치기 / 취소: 순서만 이동`
      )
    ) {
      void mergeGroups(sourceGroup, targetName);
      return;
    }

    const withoutSource = names.filter((name) => name !== sourceGroup);
    const targetIndex = withoutSource.indexOf(targetName);
    const insertIndex =
      targetIndex < 0
        ? withoutSource.length
        : targetIndex + (edge === "after" ? 1 : 0);
    void persistGroupOrder([
      ...withoutSource.slice(0, insertIndex),
      sourceGroup,
      ...withoutSource.slice(insertIndex),
    ]);
  }

  function toggleExpanded(id: number) {
    setExpandedIds((current) => {
      const next = new Set(current);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }

  // Jump from a dashboard widget straight to a task: switch to the list,
  // expand it, and scroll it into view with a brief highlight.
  function openItem(id: number) {
    setViewMode("list");
    setExpandedIds((current) => new Set(current).add(id));
    setFocusItemId(id);
  }

  useEffect(() => {
    if (focusItemId === null) {
      return;
    }

    const element = document.getElementById(`item-${focusItemId}`);
    element?.scrollIntoView({ behavior: "smooth", block: "center" });
    const timer = window.setTimeout(() => setFocusItemId(null), 1800);
    return () => window.clearTimeout(timer);
  }, [focusItemId, viewMode]);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem("team-progress-widgets");
      if (raw) {
        const parsed = JSON.parse(raw) as Record<string, boolean>;
        // Sync persisted UI prefs once on mount (SSR-safe; defaults render first).
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setWidgetPrefs((prev) => ({ ...prev, ...parsed }));
      }
    } catch {
      // ignore malformed preferences
    }
  }, []);

  useEffect(() => {
    try {
      window.localStorage.setItem(
        "team-progress-map",
        JSON.stringify({
          provider: mapProvider,
          style: mapStyle,
          googleKey: googleMapKey,
          vworldKey: vworldMapKey,
        })
      );
    } catch {
      // ignore local storage failures
    }
  }, [googleMapKey, mapProvider, mapStyle, vworldMapKey]);

  function toggleWidget(key: string) {
    setWidgetPrefs((prev) => {
      const next = { ...prev, [key]: !prev[key] };
      window.localStorage.setItem(
        "team-progress-widgets",
        JSON.stringify(next)
      );
      return next;
    });
  }

  // Keep the latest callbacks/state reachable from Leaflet event handlers
  // without re-creating the map on every render.
  useEffect(() => {
    openItemRef.current = openItem;
    clearMapPinRef.current = (id: number) => {
      const item = items.find((candidate) => candidate.id === id);
      if (item) {
        void clearMapPin(item);
      }
    };
    moveMapPinRef.current = (id: number, lat: number, lng: number) => {
      const nextLat = Number(lat.toFixed(5));
      const nextLng = Number(lng.toFixed(5));
      updateLocalItem(id, { lat: nextLat, lng: nextLng });
      void updateItem(id, { lat: nextLat, lng: nextLng });
    };
    placingItemIdRef.current = placingItemId;
    creatingOnMapRef.current = creatingOnMap;
    placeItemAtRef.current = (id: number, lat: number, lng: number) => {
      setPlacingItemId(null);
      void updateItem(id, {
        lat: Number(lat.toFixed(5)),
        lng: Number(lng.toFixed(5)),
      });
    };
    mapCreateAtRef.current = (lat: number, lng: number) => {
      setCreatingOnMap(false);
      setMapDraft({
        lat: Number(lat.toFixed(5)),
        lng: Number(lng.toFixed(5)),
      });
    };
  });

  // Create the Leaflet map when entering the map view; destroy it on leave so
  // the (conditionally rendered) container never holds a stale instance.
  useEffect(() => {
    if (viewMode !== "map" || !mapContainerMounted) {
      return;
    }

    let disposed = false;
    const container = mapContainerRef.current;

    const handlePopupClick = (event: Event) => {
      const clearTarget = (event.target as HTMLElement).closest(
        "[data-clear-pin]"
      );
      if (clearTarget) {
        clearMapPinRef.current(
          Number(clearTarget.getAttribute("data-clear-pin"))
        );
        return;
      }

      const target = (event.target as HTMLElement).closest("[data-open-item]");
      if (target) {
        openItemRef.current(Number(target.getAttribute("data-open-item")));
      }
    };
    container?.addEventListener("click", handlePopupClick);

    void (async () => {
      const leafletModule = await import("leaflet");
      const L = (leafletModule.default ?? leafletModule) as typeof LeafletNS;

      if (disposed || !mapContainerRef.current || leafletMapRef.current) {
        return;
      }

      leafletLibRef.current = L;
      const map = L.map(mapContainerRef.current).setView([36.2, 127.9], 7);
      markerLayerRef.current = L.layerGroup().addTo(map);
      leafletMapRef.current = map;

      // Placement mode: clicking the map assigns coordinates to the task
      // selected in the side panel.
      map.on("click", (event: LeafletNS.LeafletMouseEvent) => {
        const id = placingItemIdRef.current;
        if (id !== null) {
          placeItemAtRef.current(id, event.latlng.lat, event.latlng.lng);
          return;
        }
        if (creatingOnMapRef.current) {
          mapCreateAtRef.current(event.latlng.lat, event.latlng.lng);
        }
      });

      // A dashboard region row may have queued a fly-to before the map existed.
      if (pendingFlyToRef.current) {
        map.setView(pendingFlyToRef.current, 11);
        pendingFlyToRef.current = null;
      }

      // Signal the marker effect that the (async-created) map now exists.
      setMapReady((value) => value + 1);
    })();

    return () => {
      disposed = true;
      container?.removeEventListener("click", handlePopupClick);
      leafletMapRef.current?.remove();
      leafletMapRef.current = null;
      markerLayerRef.current = null;
      tileLayerRef.current = null;
      setPlacingItemId(null);
      setCreatingOnMap(false);
    };
  }, [viewMode, mapContainerMounted]);

  useEffect(() => {
    const L = leafletLibRef.current;
    const map = leafletMapRef.current;

    if (viewMode !== "map" || !L || !map) {
      return;
    }

    tileLayerRef.current?.remove();
    const config = mapTileConfig(mapProvider, mapStyle, {
      google: googleMapKey,
      vworld: vworldMapKey,
    });
    const tileOptions: LeafletNS.TileLayerOptions = {
      attribution: config.attribution,
      maxZoom: config.maxZoom,
    };

    if ("subdomains" in config) {
      tileOptions.subdomains = config.subdomains;
    }

    const layer = L.tileLayer(config.url, tileOptions).addTo(map);
    tileLayerRef.current = layer;
  }, [googleMapKey, mapProvider, mapReady, mapStyle, viewMode, vworldMapKey]);

  // Redraw markers whenever the filtered items change while the map is open.
  useEffect(() => {
    const L = leafletLibRef.current;
    const layer = markerLayerRef.current;

    if (viewMode !== "map" || !L || !layer || !leafletMapRef.current) {
      return;
    }

    layer.clearLayers();

    for (const item of visibleItems) {
      if (item.lat === null || item.lng === null) {
        continue;
      }

      const color = isItemDone(item)
        ? COMPLETE_COLOR
        : itemHasOverdueDate(item)
          ? "#dc2626"
          : itemHasUrgentDate(item)
            ? "#d97706"
            : "#18786f";
      const marker = L.marker([item.lat, item.lng], {
        draggable: true,
        icon: L.divIcon({
          className: "tb-map-pin",
          html: `<span style="--pin-color:${color}">${escapeHtml(
            String(itemProgress(item))
          )}</span>`,
          iconSize: [34, 34],
          iconAnchor: [17, 17],
        }),
      }).addTo(layer);
      const locationLabel = item.location || item.title || "이름 없는 위치";
      marker.bindTooltip(`${locationLabel} · 드래그로 위치 이동`);
      marker.on("dragend", () => {
        const next = marker.getLatLng();
        moveMapPinRef.current(item.id, next.lat, next.lng);
      });

      marker.bindPopup(
        `<div style="min-width:190px;max-width:240px;font-size:13px;line-height:1.5">
          <div style="font-weight:700">📍 ${escapeHtml(locationLabel)}</div>
          <div style="margin-top:7px;display:flex;align-items:center;gap:8px">
            <div style="min-width:0;flex:1">
              <div style="font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${escapeHtml(item.title || "제목 없음")}</div>
              <div style="color:#61667a;font-size:12px">${escapeHtml(
                assigneeName(item.assignee)
              )} · ${itemProgress(item)}%</div>
            </div>
            <button type="button" data-open-item="${item.id}" style="flex-shrink:0;white-space:nowrap;padding:3px 9px;border-radius:8px;border:1px solid #18786f;background:#e4f2ef;color:#18786f;font-weight:600;cursor:pointer">열기</button>
            <button type="button" data-clear-pin="${item.id}" style="flex-shrink:0;white-space:nowrap;padding:3px 8px;border-radius:8px;border:1px solid #edbeb8;background:#fbecea;color:#c44232;font-weight:600;cursor:pointer">핀 삭제</button>
          </div>
          <div style="margin-top:7px;color:#61667a;font-size:12px">핀을 드래그하면 좌표가 바로 저장됩니다.</div>
        </div>`
      );
    }
  }, [viewMode, visibleItems, mapReady]);

  // Drag a gantt bar's end handle to move the item's final due date.
  function startGanttDrag(
    event: ReactPointerEvent<HTMLButtonElement>,
    itemId: number
  ) {
    event.preventDefault();
    const timeline = (event.currentTarget as HTMLElement).closest(
      "[data-gantt-timeline]"
    );

    if (!timeline) {
      return;
    }

    const rect = timeline.getBoundingClientRect();
    const { min, span } = gantt;
    const toPct = (clientX: number) =>
      Math.min(100, Math.max(0, ((clientX - rect.left) / rect.width) * 100));

    setGanttDrag({ itemId, pct: toPct(event.clientX) });

    const handleMove = (moveEvent: PointerEvent) => {
      setGanttDrag({ itemId, pct: toPct(moveEvent.clientX) });
    };
    const handleUp = (upEvent: PointerEvent) => {
      window.removeEventListener("pointermove", handleMove);
      const pct = toPct(upEvent.clientX);
      setGanttDrag(null);
      void updateItem(itemId, {
        dueDate: isoDate(new Date(min + (span * pct) / 100)),
      });
    };

    window.addEventListener("pointermove", handleMove);
    window.addEventListener("pointerup", handleUp, { once: true });
  }

  function progressColor(item: WorkflowItem) {
    if (isItemDone(item)) {
      return COMPLETE_COLOR;
    }

    if (itemHasOverdueDate(item)) {
      return "#c44232";
    }

    if (itemHasUrgentDate(item)) {
      return "#b66d12";
    }

    return "#18786f";
  }

  const activeMapTileNotice = mapTileConfig(mapProvider, mapStyle, {
    google: googleMapKey,
    vworld: vworldMapKey,
  }).notice;

  const landingWorkspaces = workspaces.length
    ? workspaces
    : activeWorkspace
      ? [activeWorkspace]
      : [];
  const selectedLandingWorkspace =
    landingWorkspaces.find((workspace) => workspace.id === activeWorkspaceId) ??
    landingWorkspaces[0] ??
    activeWorkspace;
  const landingYears = [
    ...new Set(landingWorkspaces.map((workspace) => workspaceYear(workspace))),
  ].sort((first, second) => second.localeCompare(first, "ko-KR"));
  const landingTeams = landingWorkspaces
    .filter(
      (workspace) =>
        workspaceYear(workspace) === workspaceYear(selectedLandingWorkspace)
    )
    .map((workspace) => workspaceTeam(workspace))
    .filter((team, index, list) => list.indexOf(team) === index)
    .sort((first, second) => first.localeCompare(second, "ko-KR"));
  const recentLandingWorkspaces = recentWorkspaceIds
    .map((id) => landingWorkspaces.find((workspace) => workspace.id === id))
    .filter(
      (workspace, index, list): workspace is WorkspaceSummary => {
        if (!workspace) {
          return false;
        }

        return (
          list.findIndex((candidate) => candidate?.id === workspace.id) === index
        );
      }
    )
    .slice(0, 4);

  function chooseLandingYear(year: string) {
    const workspace =
      landingWorkspaces.find((candidate) => workspaceYear(candidate) === year) ??
      selectedLandingWorkspace;

    if (workspace) {
      setActiveWorkspaceId(workspace.id);
      setActiveWorkspace(workspace);
    }
  }

  function chooseRecentWorkspace(workspace: WorkspaceSummary) {
    setActiveWorkspaceId(workspace.id);
    setActiveWorkspace(workspace);
    setWorkspacePasswordInput("");
    setError("");
    window.setTimeout(() => landingPasswordRef.current?.focus(), 0);
  }

  function chooseLandingTeam(team: string) {
    const year = workspaceYear(selectedLandingWorkspace);
    const workspace =
      landingWorkspaces.find(
        (candidate) =>
          workspaceYear(candidate) === year && workspaceTeam(candidate) === team
      ) ?? selectedLandingWorkspace;

    if (workspace) {
      setActiveWorkspaceId(workspace.id);
      setActiveWorkspace(workspace);
    }
  }

  async function enterLanding(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!selectedLandingWorkspace) {
      setError("입장할 연도와 조직/팀을 선택해 주세요.");
      return;
    }

    saveUserName(userName);

    const ok = await loadTasks(
      workspacePasswordInput,
      selectedLandingWorkspace.id
    );

    if (ok) {
      setLandingOpen(false);
    }
  }


  return {
    items,
    setItems,
    templates,
    setTemplates,
    history,
    setHistory,
    assigneeSettings,
    setAssigneeSettings,
    organizationName,
    setOrganizationName,
    boardTitle,
    setBoardTitle,
    activeWorkspaceId,
    setActiveWorkspaceId,
    activeWorkspace,
    setActiveWorkspace,
    workspaces,
    setWorkspaces,
    workspacePassword,
    setWorkspacePassword,
    workspacePasswordInput,
    setWorkspacePasswordInput,
    workspaceLocked,
    setWorkspaceLocked,
    landingOpen,
    setLandingOpen,
    workspaceDepartmentDraft,
    setWorkspaceDepartmentDraft,
    workspaceTeamDraft,
    setWorkspaceTeamDraft,
    newWorkspaceDepartment,
    setNewWorkspaceDepartment,
    newWorkspaceTeam,
    setNewWorkspaceTeam,
    newWorkspacePassword,
    setNewWorkspacePassword,
    copyPreviousYear,
    setCopyPreviousYear,
    sourceWorkspacePassword,
    setSourceWorkspacePassword,
    workspacePasswordDraft,
    setWorkspacePasswordDraft,
    creatingWorkspace,
    setCreatingWorkspace,
    savingWorkspace,
    setSavingWorkspace,
    userName,
    setUserName,
    recentWorkspaceIds,
    setRecentWorkspaceIds,
    filter,
    setFilter,
    dueFilter,
    setDueFilter,
    sortMode,
    setSortMode,
    viewMode,
    setViewMode,
    showFilters,
    setShowFilters,
    templateEditorOpen,
    setTemplateEditorOpen,
    templateDraft,
    setTemplateDraft,
    savingTemplate,
    setSavingTemplate,
    focusItemId,
    setFocusItemId,
    notifOpen,
    setNotifOpen,
    widgetMenuOpen,
    setWidgetMenuOpen,
    widgetPrefs,
    setWidgetPrefs,
    mapReady,
    setMapReady,
    mapContainerRef,
    setMapContainerMounted,
    leafletLibRef,
    leafletMapRef,
    markerLayerRef,
    tileLayerRef,
    landingPasswordRef,
    openItemRef,
    clearMapPinRef,
    moveMapPinRef,
    placingItemId,
    setPlacingItemId,
    placingItemIdRef,
    placeItemAtRef,
    pendingFlyToRef,
    creatingOnMap,
    setCreatingOnMap,
    creatingOnMapRef,
    mapCreateAtRef,
    mapDraft,
    setMapDraft,
    mapNewTitle,
    setMapNewTitle,
    mapNewAssignee,
    setMapNewAssignee,
    mapNewLocation,
    setMapNewLocation,
    initialMapPrefs,
    mapProvider,
    setMapProvider,
    mapStyle,
    setMapStyle,
    googleMapKey,
    setGoogleMapKey,
    vworldMapKey,
    setVworldMapKey,
    mapSearchQuery,
    setMapSearchQuery,
    mapSearchResults,
    setMapSearchResults,
    mapSearching,
    setMapSearching,
    mapSearchError,
    setMapSearchError,
    mapSettingsOpen,
    setMapSettingsOpen,
    ganttDrag,
    setGanttDrag,
    linkDrafts,
    setLinkDrafts,
    duplicateTarget,
    setDuplicateTarget,
    reportOpen,
    setReportOpen,
    docsOpen,
    setDocsOpen,
    manualOpen,
    setManualOpen,
    documents,
    setDocuments,
    docsLoading,
    setDocsLoading,
    uploadingDoc,
    setUploadingDoc,
    docName,
    setDocName,
    docFile,
    setDocFile,
    reportMonth,
    setReportMonth,
    reportSort,
    setReportSort,
    webhookUrl,
    setWebhookUrl,
    webhookEnabled,
    setWebhookEnabled,
    savingWebhook,
    setSavingWebhook,
    sendingAlerts,
    setSendingAlerts,
    alertResult,
    setAlertResult,
    assigneeFilter,
    setAssigneeFilter,
    categoryFilter,
    setCategoryFilter,
    templateFilter,
    setTemplateFilter,
    stageFilter,
    setStageFilter,
    keyword,
    setKeyword,
    newTitle,
    setNewTitle,
    newAssignee,
    setNewAssignee,
    newMemo,
    setNewMemo,
    newAllocatedBudget,
    setNewAllocatedBudget,
    newRequiredBudget,
    setNewRequiredBudget,
    newDueDate,
    setNewDueDate,
    newTemplateKey,
    setNewTemplateKey,
    expandedIds,
    setExpandedIds,
    expandedStepIds,
    setExpandedStepIds,
    subtaskDrafts,
    setSubtaskDrafts,
    stepDrafts,
    setStepDrafts,
    newGroup,
    setNewGroup,
    newCategoryName,
    setNewCategoryName,
    activeAddGroup,
    setActiveAddGroup,
    collapsedGroups,
    setCollapsedGroups,
    groupOrder,
    setGroupOrder,
    draggedGroup,
    setDraggedGroup,
    dropIndicator,
    setDropIndicator,
    editingGroup,
    setEditingGroup,
    groupNameDraft,
    setGroupNameDraft,
    deletingGroups,
    setDeletingGroups,
    loading,
    setLoading,
    adding,
    setAdding,
    savingGroup,
    setSavingGroup,
    savingSettings,
    setSavingSettings,
    draggedId,
    setDraggedId,
    savingOrder,
    setSavingOrder,
    savingItemIds,
    setSavingItemIds,
    deletingItemIds,
    setDeletingItemIds,
    savingStepIds,
    setSavingStepIds,
    savingSubtaskIds,
    setSavingSubtaskIds,
    error,
    setError,
    currentActor,
    workspaceHeaders,
    taskRequest,
    documentRequest,
    rememberWorkspacePassword,
    rememberRecentWorkspace,
    loadTasks,
    saveUserName,
    unlockWorkspace,
    createWorkspace,
    saveWorkspaceSettings,
    saveBoardSettings,
    assignees,
    groupName,
    groupContainsCategory,
    categories,
    orderedCategoryNames,
    templatesByKey,
    itemTypeName,
    selectedTemplate,
    baseItems,
    visibleItems,
    listGroups,
    stages,
    gridGroups,
    totalSteps,
    completedSteps,
    overallProgress,
    openItemCount,
    bottlenecks,
    assigneeStats,
    dashboard,
    notifications,
    report,
    toggleReportSort,
    reportSortButton,
    downloadReportCsv,
    printReport,
    gantt,
    replaceItem,
    updateLocalItem,
    updateLocalSubtask,
    updateItem,
    clearMapPin,
    deleteItem,
    updateStep,
    updateStepDueDate,
    updateSubtask,
    addSubtask,
    addStepSubtask,
    deleteSubtask,
    toggleStepExpanded,
    addItem,
    saveAssigneeColor,
    duplicateItem,
    openDocuments,
    uploadDocument,
    deleteDocument,
    downloadDocument,
    saveWebhook,
    sendDeadlineAlerts,
    searchMapPlaces,
    createItemOnMap,
    openTemplateEditor,
    saveTemplateDraft,
    deleteTemplateByKey,
    changeItemTemplate,
    orderedItemIds,
    applyOptimisticOrder,
    persistItemMove,
    dropEdgeFromEvent,
    updateDropIndicator,
    moveDraggedItemTo,
    handleItemDragOver,
    handleDrop,
    handleDragOver,
    persistGroupOrder,
    openGroupTaskForm,
    addGroup,
    deleteGroup,
    renameGroup,
    mergeGroups,
    handleGroupDragOver,
    handleGroupDrop,
    toggleExpanded,
    openItem,
    toggleWidget,
    startGanttDrag,
    progressColor,
    activeMapTileNotice,
    landingWorkspaces,
    selectedLandingWorkspace,
    landingYears,
    landingTeams,
    recentLandingWorkspaces,
    chooseLandingYear,
    chooseRecentWorkspace,
    chooseLandingTeam,
    enterLanding,
  };
}

export type Board = ReturnType<typeof useTaskBoard>;

import {
  categoryKey,
  categoryPath,
  defaultSettings,
} from "../lib/board-config";
import {
  type WorkspaceSummary,
} from "../lib/workflow";

export const COMPLETE_COLOR = "#2563eb";

export type ReportSortKey =
  | "category"
  | "title"
  | "budget"
  | "assignee"
  | "progress"
  | "dueDate"
  | "status";
export type SortDirection = "asc" | "desc";
export type MapProvider = "osm" | "google" | "vworld";
export type MapStyle = "road" | "satellite" | "hybrid";
export type MapSearchResult = {
  label: string;
  lat: number;
  lng: number;
  source: string;
};
export type DropEdge = "before" | "after";
export type DropIndicator =
  | {
      kind: "item";
      targetId: number;
      category: string;
      edge: DropEdge;
    }
  | {
      kind: "group";
      targetName: string;
      edge: DropEdge;
      mode: "append" | "merge";
    };

export const REPORT_STATUS_ORDER: Record<string, number> = {
  지연: 0,
  임박: 1,
  진행: 2,
  완료: 3,
};

export const CATEGORY_COLORS = [
  "#18786f",
  "#8b6f16",
  "#4f7f52",
  "#b25642",
  "#356b9a",
  "#8a5b8f",
  "#6f7b2d",
  "#9a6a3a",
];

export const MAP_PROVIDER_LABELS: Record<MapProvider, string> = {
  osm: "Leaflet / OSM",
  google: "Google",
  vworld: "VWorld",
};

export const MAP_STYLE_LABELS: Record<MapStyle, string> = {
  road: "일반",
  satellite: "위성",
  hybrid: "하이브리드",
};

export function colorHash(value: string) {
  return Array.from(value).reduce(
    (hash, char) => (hash * 31 + char.charCodeAt(0)) >>> 0,
    7
  );
}

export function hexToRgba(hex: string, alpha: number) {
  const value = hex.replace("#", "");
  const red = parseInt(value.slice(0, 2), 16);
  const green = parseInt(value.slice(2, 4), 16);
  const blue = parseInt(value.slice(4, 6), 16);

  return `rgba(${red}, ${green}, ${blue}, ${alpha})`;
}

export function categoryVisual(value: string) {
  const root = categoryPath(value)[0] ?? "미분류";
  const color = CATEGORY_COLORS[colorHash(root) % CATEGORY_COLORS.length];

  return {
    color,
    soft: hexToRgba(color, 0.09),
    softer: hexToRgba(color, 0.045),
  };
}

export function replaceCategoryPrefix(value: string, source: string, target: string) {
  const current = categoryKey(value);
  const from = categoryKey(source);
  const to = categoryKey(target);

  if (!current || current === categoryKey("")) {
    return value;
  }

  if (current === from) {
    return to;
  }

  if (current.startsWith(`${from} > `)) {
    return `${to} > ${current.slice(from.length + 3)}`;
  }

  return current;
}

export function storedCategoryName(value: string) {
  const key = categoryKey(value);
  return key === categoryKey("") ? "" : key;
}

export function mapTileConfig(
  provider: MapProvider,
  style: MapStyle,
  keys: { google: string; vworld: string }
) {
  if (provider === "vworld" && keys.vworld.trim()) {
    const layer =
      style === "satellite" ? "Satellite" : style === "hybrid" ? "Hybrid" : "Base";

    return {
      url: `https://api.vworld.kr/req/wmts/1.0.0/${encodeURIComponent(
        keys.vworld.trim()
      )}/${layer}/{z}/{y}/{x}.png`,
      attribution: "VWorld",
      maxZoom: 19,
      notice: "",
    };
  }

  if (provider === "google") {
    const layer = style === "satellite" ? "s" : style === "hybrid" ? "y" : "m";
    const key = keys.google.trim()
      ? `&key=${encodeURIComponent(keys.google.trim())}`
      : "";

    return {
      url: `https://mt{s}.google.com/vt/lyrs=${layer}&x={x}&y={y}&z={z}${key}`,
      attribution: "Google",
      maxZoom: 20,
      subdomains: ["0", "1", "2", "3"],
      notice: keys.google.trim()
        ? ""
        : "Google 지도는 공식 사용을 위해 API 키 설정을 권장합니다.",
    };
  }

  const notice =
    provider === "vworld" && !keys.vworld.trim()
      ? "VWorld 지도를 보려면 VWorld API 키를 입력해 주세요. 키가 없으면 기본 지도로 표시됩니다."
      : "";

  return {
    url:
      style === "satellite"
        ? "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
        : "https://tile.openstreetmap.org/{z}/{x}/{y}.png",
    attribution:
      style === "satellite"
        ? "Tiles &copy; Esri"
        : '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    maxZoom: style === "satellite" ? 19 : 19,
    notice,
  };
}

export function readMapPrefs() {
  const fallback = {
    provider: "osm" as MapProvider,
    style: "road" as MapStyle,
    googleKey: "",
    vworldKey: "",
  };

  if (typeof window === "undefined") {
    return fallback;
  }

  try {
    const raw = window.localStorage.getItem("team-progress-map");
    if (!raw) {
      return fallback;
    }

    const parsed = JSON.parse(raw) as {
      provider?: MapProvider;
      style?: MapStyle;
      googleKey?: string;
      vworldKey?: string;
    };

    return {
      provider:
        parsed.provider && parsed.provider in MAP_PROVIDER_LABELS
          ? parsed.provider
          : fallback.provider,
      style:
        parsed.style && parsed.style in MAP_STYLE_LABELS
          ? parsed.style
          : fallback.style,
      googleKey: parsed.googleKey ?? "",
      vworldKey: parsed.vworldKey ?? "",
    };
  } catch {
    return fallback;
  }
}

export const WORKSPACE_STORAGE_KEY = "team-progress-workspace-id";
export const RECENT_WORKSPACES_STORAGE_KEY = "team-progress-recent-workspace-ids";

export function readStoredWorkspaceId() {
  if (typeof window === "undefined") {
    return "default";
  }

  return window.localStorage.getItem(WORKSPACE_STORAGE_KEY) || "default";
}

export function readRecentWorkspaceIds() {
  if (typeof window === "undefined") {
    return [];
  }

  const currentWorkspaceId = window.localStorage.getItem(WORKSPACE_STORAGE_KEY);
  const stored = window.localStorage.getItem(RECENT_WORKSPACES_STORAGE_KEY);
  let ids: string[] = [];

  try {
    const parsed = stored ? JSON.parse(stored) : [];
    ids = Array.isArray(parsed)
      ? parsed.filter((id): id is string => typeof id === "string" && Boolean(id))
      : [];
  } catch {
    ids = [];
  }

  return [
    ...(currentWorkspaceId ? [currentWorkspaceId] : []),
    ...ids,
  ].filter((id, index, list) => list.indexOf(id) === index);
}

export function workspacePasswordKey(id: string) {
  return `team-progress-workspace-password:${id}`;
}

export function readWorkspacePassword(id: string) {
  if (typeof window === "undefined") {
    return "";
  }

  return window.sessionStorage.getItem(workspacePasswordKey(id)) || "";
}

export function readStoredUserName() {
  if (typeof window === "undefined") {
    return "사용자";
  }

  return window.localStorage.getItem("team-progress-user-name")?.trim() || "사용자";
}

export function workspaceName(workspace: WorkspaceSummary | null) {
  return workspace?.label || "연도/조직 보드";
}

export function workspaceYear(workspace: WorkspaceSummary | null) {
  return workspace?.departmentName.trim() || "2026";
}

export function workspaceTeam(workspace: WorkspaceSummary | null) {
  return workspace?.teamName.trim() || "습지복원팀";
}

export function workspaceOrganizationName(workspace: WorkspaceSummary | null) {
  if (!workspace) {
    return defaultSettings.organizationName;
  }

  return (
    workspace.label.trim() ||
    [workspace.departmentName.trim(), workspace.teamName.trim()]
      .filter(Boolean)
      .join(" ") ||
    defaultSettings.organizationName
  );
}

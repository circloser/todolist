"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type * as LeafletNS from "leaflet";
import "leaflet/dist/leaflet.css";

import { AREA_COLORS, MAX_AREAS_PER_IMPORT, type AreasResponse, type MapArea } from "./lib/areas";
import { escapeHtml } from "./lib/board-config";
import {
  formatArea,
  formatLength,
  geometryArea,
  geometryBounds,
  geometryPerimeter,
  ringFromPoints,
  vertexCount,
  type AreaGeometry,
} from "./lib/geo";
import {
  KOREA_CENTER,
  KOREA_ZOOM,
  MAP_STYLE_LABELS,
  directionLinks,
  formatCoordinates,
  hybridLabelsUrl,
  mapTileConfig,
  searchPlaceNames,
  shortPlaceName,
  type MapProvider,
  type MapSearchResult,
  type MapStyle,
} from "./lib/map-config";
import { PLACE_KINDS, placeKindOf, placeKindsInUse, type MapPlace, type PlacesResponse } from "./lib/places";
import type { Viewer } from "./lib/team";
import {
  assigneeName,
  isItemDone,
  itemHasOverdueDate,
  itemHasUrgentDate,
  itemProgress,
  nextStep,
  type WorkflowItem,
} from "./lib/workflow";
import { AreaEditor, ShpImportDialog, type AreaDraft, type ImportedArea } from "./map-areas";
import { PlaceEditor, draftFromPlace, newPlaceDraft, placePinHtml, type PlaceDraft } from "./map-places";

// 지도: the board map, built like the everyday map apps.
// - 더블클릭 · 우클릭 · 길게 누르기 → "여기에 장소 / 업무 추가, 좌표 복사" menu
// - Search box on the map: this board's 업무·장소 first, then place names
// - Left panel (bottom sheet on phones): 업무 · 장소 · 구역 · 위치 미지정
// - 구역: draw a polygon (click corners, double click to finish) or import a
//   Shapefile; area and perimeter are shown in ㎡ · ha · 평
// - Pins open an info card (열기·수정, 길찾기, 좌표 복사, 삭제); drag to move
//   with 되돌리기; 내 위치, 전체 보기, 일반/위성/하이브리드, scale, live coords.

type ApiRequest = (path: string, init?: RequestInit) => Promise<Response>;

export type MapFocus = { key: number } & (
  | { placeId: number }
  | { itemId: number }
  | { lat: number; lng: number; zoom?: number }
);

type Selection =
  | { kind: "item"; id: number }
  | { kind: "place"; id: number }
  | { kind: "area"; id: number }
  | { kind: "result"; result: MapSearchResult };

type Mode =
  | null
  | { kind: "assign"; itemId: number }
  | { kind: "new-place" }
  | { kind: "new-item" }
  | { kind: "repick"; draft: PlaceDraft }
  | { kind: "draw"; points: Array<[number, number]> };

/** Where the "add here" menu opens; flipX/flipY keep it inside the map. */
type Menu = { lat: number; lng: number; x: number; y: number; flipX: boolean; flipY: boolean };
type Tab = "items" | "places" | "areas" | "unplaced";
const HIDDEN_ITEMS_KEY = "wc-map-hidden-items";
type Toast = { id: number; text: string; undo?: () => void };

const STATUS_COLORS = [
  { color: "#18786f", label: "진행" },
  { color: "#d97706", label: "임박" },
  { color: "#dc2626", label: "지연" },
  { color: "#2563eb", label: "완료" },
];

function itemColor(item: WorkflowItem) {
  return isItemDone(item) ? "#2563eb" : itemHasOverdueDate(item) ? "#dc2626" : itemHasUrgentDate(item) ? "#d97706" : "#18786f";
}

function located(item: WorkflowItem): item is WorkflowItem & { lat: number; lng: number } {
  return item.lat !== null && item.lng !== null;
}

function shortArea(m2: number) {
  return m2 >= 10_000
    ? `${(m2 / 10_000).toLocaleString("ko-KR", { maximumFractionDigits: 2 })}ha`
    : `${Math.round(m2).toLocaleString("ko-KR")}㎡`;
}

function downloadGeoJson(area: MapArea) {
  const data = {
    type: "FeatureCollection",
    features: [
      {
        type: "Feature",
        properties: { name: area.name, memo: area.memo, area_m2: area.areaM2, perimeter_m: area.perimeterM },
        geometry: area.geometry,
      },
    ],
  };
  const url = URL.createObjectURL(new Blob([JSON.stringify(data)], { type: "application/geo+json" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = `${area.name.replace(/[\\/:*?"<>|]+/g, "_") || "구역"}.geojson`;
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function round(value: number) {
  return Number(value.toFixed(5));
}

type MapViewProps = {
  items: WorkflowItem[];
  places: MapPlace[];
  onPlacesChange: (update: (current: MapPlace[]) => MapPlace[]) => void;
  me: Viewer | null;
  isManager: boolean;
  canCreateItems: boolean;
  canEditItem: (item: WorkflowItem) => boolean;
  provider: MapProvider;
  mapStyle: MapStyle;
  googleKey: string;
  vworldKey: string;
  onStyleChange: (style: MapStyle) => void;
  onOpenSettings: () => void;
  request: ApiRequest;
  focus: MapFocus | null;
  onFocusHandled: () => void;
  onOpenItem: (id: number) => void;
  onMoveItem: (id: number, lat: number | null, lng: number | null) => void;
  onClearItemPin: (item: WorkflowItem) => void;
  onCreateItemAt: (point: { lat: number; lng: number; location: string }) => void;
};

export default function MapView({
  items,
  places,
  onPlacesChange,
  me,
  isManager,
  canCreateItems,
  canEditItem,
  provider,
  mapStyle,
  googleKey,
  vworldKey,
  onStyleChange,
  onOpenSettings,
  request,
  focus,
  onFocusHandled,
  onOpenItem,
  onMoveItem,
  onClearItemPin,
  onCreateItemAt,
}: MapViewProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const coordsRef = useRef<HTMLSpanElement | null>(null);
  const leafletRef = useRef<typeof LeafletNS | null>(null);
  const mapRef = useRef<LeafletNS.Map | null>(null);
  const tileRef = useRef<LeafletNS.TileLayer | null>(null);
  const labelsRef = useRef<LeafletNS.TileLayer | null>(null);
  const itemLayerRef = useRef<LeafletNS.LayerGroup | null>(null);
  const placeLayerRef = useRef<LeafletNS.LayerGroup | null>(null);
  const areaLayerRef = useRef<LeafletNS.LayerGroup | null>(null);
  const drawLayerRef = useRef<LeafletNS.LayerGroup | null>(null);
  const rubberRef = useRef<LeafletNS.Polyline | null>(null);
  const shpInputRef = useRef<HTMLInputElement | null>(null);
  const tempLayerRef = useRef<LeafletNS.LayerGroup | null>(null);
  const markersRef = useRef<Map<string, LeafletNS.Marker>>(new Map());
  const fittedRef = useRef(false);
  const handlersRef = useRef<{
    pick: (lat: number, lng: number, x: number, y: number) => void;
    click: (lat: number, lng: number) => void;
    move: (lat: number, lng: number) => void;
    area: (id: number, lat: number, lng: number) => void;
    closeMenu: () => void;
  }>({ pick: () => {}, click: () => {}, move: () => {}, area: () => {}, closeMenu: () => {} });

  const [ready, setReady] = useState(0);
  const [selected, setSelected] = useState<Selection | null>(null);
  const [menu, setMenu] = useState<Menu | null>(null);
  const [mode, setMode] = useState<Mode>(null);
  const [tab, setTab] = useState<Tab>("items");
  const [panelOpen, setPanelOpen] = useState(
    () => typeof window === "undefined" || window.matchMedia("(min-width: 1024px)").matches
  );
  const [showItems, setShowItems] = useState(true);
  // Work-item pins switched off one by one (remembered in this browser).
  const [hiddenItemIds, setHiddenItemIds] = useState<Set<number>>(() => {
    try {
      const raw = JSON.parse(window.localStorage.getItem(HIDDEN_ITEMS_KEY) ?? "[]");
      return new Set(Array.isArray(raw) ? raw.filter((id) => Number.isInteger(id)) : []);
    } catch {
      return new Set();
    }
  });
  const [showPlaces, setShowPlaces] = useState(true);
  const [hiddenKinds, setHiddenKinds] = useState<Set<string>>(new Set());
  const [query, setQuery] = useState("");
  const [geoResults, setGeoResults] = useState<{ query: string; results: MapSearchResult[] } | null>(null);
  const [geoSearching, setGeoSearching] = useState(false);
  const [geoError, setGeoError] = useState("");
  const [placeDraft, setPlaceDraft] = useState<PlaceDraft | null>(null);
  const [placeError, setPlaceError] = useState("");
  const [savingPlace, setSavingPlace] = useState(false);
  const [toast, setToast] = useState<Toast | null>(null);
  const [myLocation, setMyLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [areas, setAreas] = useState<MapArea[]>([]);
  const [showAreas, setShowAreas] = useState(true);
  const [areaDraft, setAreaDraft] = useState<AreaDraft | null>(null);
  const [areaError, setAreaError] = useState("");
  const [savingArea, setSavingArea] = useState(false);
  const [shpFiles, setShpFiles] = useState<File[] | null>(null);
  const [shpPreview, setShpPreview] = useState<AreaGeometry[]>([]);
  const [shpError, setShpError] = useState("");
  const [savingShp, setSavingShp] = useState(false);

  const pinned = useMemo(() => items.filter(located), [items]);
  const shownPinned = useMemo(() => pinned.filter((item) => !hiddenItemIds.has(item.id)), [hiddenItemIds, pinned]);
  const hiddenPinnedCount = pinned.length - shownPinned.length;

  useEffect(() => {
    try {
      window.localStorage.setItem(HIDDEN_ITEMS_KEY, JSON.stringify([...hiddenItemIds]));
    } catch {
      // Not remembered; fine.
    }
  }, [hiddenItemIds]);

  function setItemHidden(id: number, hidden: boolean) {
    setHiddenItemIds((current) => {
      if (current.has(id) === hidden) {
        return current;
      }
      const next = new Set(current);
      if (hidden) {
        next.add(id);
      } else {
        next.delete(id);
      }
      return next;
    });
  }
  const unplaced = useMemo(() => items.filter((item) => !located(item)), [items]);
  const kinds = useMemo(() => placeKindsInUse(places), [places]);
  const visiblePlaces = useMemo(
    () => places.filter((place) => !hiddenKinds.has(placeKindOf(place).label)),
    [hiddenKinds, places]
  );
  const canEditPlace = (place: Pick<MapPlace, "createdByMemberId">) =>
    isManager || (me !== null && place.createdByMemberId === me.memberId);
  const canEditArea = canEditPlace;
  const sortedAreas = useMemo(() => areas.slice().sort((a, b) => a.name.localeCompare(b.name, "ko-KR") || a.id - b.id), [areas]);
  const areaTotal = useMemo(() => areas.reduce((sum, area) => sum + area.areaM2, 0), [areas]);

  // 구역 are loaded here (the rest of the board does not need them).
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const response = await request("/api/areas", { cache: "no-store" });
        const data = (await response.json().catch(() => ({}))) as AreasResponse;
        if (!cancelled && response.ok) {
          const loaded = data.areas ?? [];
          setAreas(loaded);
          // A board with 구역 but no pins opens on its 구역.
          if (loaded.length && !focus && !items.some(located) && !places.length) {
            window.setTimeout(() => fitGeometries(loaded.map((area) => area.geometry)), 0);
          }
        }
      } catch {
        // 구역 are optional; the map works without them.
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [request]);

  const toastSeq = useRef(0);
  function say(text: string, undo?: () => void) {
    toastSeq.current += 1;
    setToast({ id: toastSeq.current, text, undo });
  }

  // ------------------------------------------------------------ map setup

  useEffect(() => {
    let disposed = false;
    void (async () => {
      const leafletModule = await import("leaflet");
      const L = (leafletModule.default ?? leafletModule) as typeof LeafletNS;
      if (disposed || !containerRef.current || mapRef.current) {
        return;
      }
      leafletRef.current = L;
      const map = L.map(containerRef.current, { doubleClickZoom: false, zoomControl: false }).setView(KOREA_CENTER, KOREA_ZOOM);
      L.control.zoom({ position: "bottomright", zoomInTitle: "확대", zoomOutTitle: "축소" }).addTo(map);
      L.control.scale({ position: "bottomleft", imperial: false }).addTo(map);
      areaLayerRef.current = L.layerGroup().addTo(map);
      drawLayerRef.current = L.layerGroup().addTo(map);
      itemLayerRef.current = L.layerGroup().addTo(map);
      placeLayerRef.current = L.layerGroup().addTo(map);
      tempLayerRef.current = L.layerGroup().addTo(map);
      mapRef.current = map;

      // Double click, right click and (on touch screens) a long press all open
      // the "add here" menu, like the common map apps.
      const pick = (event: LeafletNS.LeafletMouseEvent) => {
        event.originalEvent?.preventDefault();
        handlersRef.current.pick(event.latlng.lat, event.latlng.lng, event.containerPoint.x, event.containerPoint.y);
      };
      map.on("dblclick", pick);
      map.on("contextmenu", pick);
      map.on("click", (event: LeafletNS.LeafletMouseEvent) => handlersRef.current.click(event.latlng.lat, event.latlng.lng));
      map.on("movestart zoomstart", () => handlersRef.current.closeMenu());
      map.on("mousemove", (event: LeafletNS.LeafletMouseEvent) => {
        handlersRef.current.move(event.latlng.lat, event.latlng.lng);
        if (coordsRef.current) {
          coordsRef.current.textContent = formatCoordinates(event.latlng.lat, event.latlng.lng);
        }
      });
      setReady((value) => value + 1);
    })();
    return () => {
      disposed = true;
      const map = mapRef.current;
      if (map) {
        // Leaving mid-animation (e.g. switching tabs while it zooms) must not
        // let Leaflet's pending timers touch the removed map: finish an
        // in-flight zoom now, so its delayed transition-end call is a no-op.
        const internal = map as unknown as { _animatingZoom?: boolean; _onZoomTransitionEnd?: () => void };
        try {
          if (internal._animatingZoom) {
            internal._onZoomTransitionEnd?.();
          }
          map.stop();
          map.off();
          map.remove();
        } catch {
          // Already torn down.
        }
      }
      mapRef.current = null;
      itemLayerRef.current = null;
      placeLayerRef.current = null;
      areaLayerRef.current = null;
      drawLayerRef.current = null;
      rubberRef.current = null;
      tempLayerRef.current = null;
      tileRef.current = null;
      labelsRef.current = null;
      markersRef.current = new Map();
    };
  }, []);

  // Base tiles (+ labels for hybrid imagery).
  useEffect(() => {
    const L = leafletRef.current;
    const map = mapRef.current;
    if (!L || !map) {
      return;
    }
    tileRef.current?.remove();
    labelsRef.current?.remove();
    const config = mapTileConfig(provider, mapStyle, { google: googleKey, vworld: vworldKey });
    const options: LeafletNS.TileLayerOptions = { attribution: config.attribution, maxZoom: config.maxZoom };
    if ("subdomains" in config && config.subdomains) {
      options.subdomains = config.subdomains;
    }
    tileRef.current = L.tileLayer(config.url, options).addTo(map);
    const labels = hybridLabelsUrl(provider, mapStyle, { vworld: vworldKey });
    labelsRef.current = labels ? L.tileLayer(labels, { maxZoom: 19, pane: "overlayPane" }).addTo(map) : null;
  }, [googleKey, mapStyle, provider, ready, vworldKey]);

  // ------------------------------------------------------------ interactions

  async function placeRequest(method: "POST" | "PATCH" | "DELETE", body: Record<string, unknown>) {
    const response = await request("/api/places", {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = (await response.json().catch(() => ({}))) as PlacesResponse;
    if (!response.ok) {
      throw new Error(data.error ?? "장소를 저장하지 못했습니다.");
    }
    return data;
  }

  async function movePlace(place: MapPlace, lat: number, lng: number, undoable = true) {
    const previous = { lat: place.lat, lng: place.lng };
    onPlacesChange((current) => current.map((entry) => (entry.id === place.id ? { ...entry, lat, lng } : entry)));
    try {
      const data = await placeRequest("PATCH", { id: place.id, lat, lng });
      if (data.place) {
        const saved = data.place;
        onPlacesChange((current) => current.map((entry) => (entry.id === saved.id ? saved : entry)));
      }
      if (undoable) {
        say(`‘${place.name}’ 위치를 옮겼습니다.`, () => void movePlace({ ...place, lat, lng }, previous.lat, previous.lng, false));
      }
    } catch (moveError) {
      onPlacesChange((current) => current.map((entry) => (entry.id === place.id ? { ...entry, ...previous } : entry)));
      say(moveError instanceof Error ? moveError.message : "장소 위치를 바꾸지 못했습니다.");
    }
  }

  function moveItem(item: WorkflowItem, lat: number | null, lng: number | null, undoable = true) {
    const previous = { lat: item.lat, lng: item.lng };
    onMoveItem(item.id, lat, lng);
    if (undoable) {
      say(
        previous.lat === null ? `‘${item.title || "업무"}’ 위치를 지정했습니다.` : `‘${item.title || "업무"}’ 위치를 옮겼습니다.`,
        () => onMoveItem(item.id, previous.lat, previous.lng)
      );
    }
  }

  async function savePlace() {
    if (!placeDraft) {
      return;
    }
    setSavingPlace(true);
    setPlaceError("");
    try {
      const data = await placeRequest(placeDraft.id ? "PATCH" : "POST", { ...placeDraft });
      const saved = data.place;
      if (saved) {
        onPlacesChange((current) => [...current.filter((place) => place.id !== saved.id), saved]);
        setSelected({ kind: "place", id: saved.id });
        setHiddenKinds((current) => {
          const label = placeKindOf(saved).label;
          if (!current.has(label)) {
            return current;
          }
          const next = new Set(current);
          next.delete(label);
          return next;
        });
        setShowPlaces(true);
      }
      setPlaceDraft(null);
    } catch (saveError) {
      setPlaceError(saveError instanceof Error ? saveError.message : "장소를 저장하지 못했습니다.");
    } finally {
      setSavingPlace(false);
    }
  }

  async function deletePlace(place: MapPlace) {
    if (!window.confirm(`'${place.name}' 장소를 지도에서 삭제할까요?`)) {
      return;
    }
    try {
      await placeRequest("DELETE", { id: place.id });
      onPlacesChange((current) => current.filter((entry) => entry.id !== place.id));
      setSelected(null);
      setPlaceDraft((current) => (current?.id === place.id ? null : current));
      say(`‘${place.name}’ 장소를 삭제했습니다.`);
    } catch (deleteError) {
      say(deleteError instanceof Error ? deleteError.message : "장소를 삭제하지 못했습니다.");
    }
  }

  // ------------------------------------------------------------ 구역

  async function areaRequest(method: "POST" | "PATCH" | "DELETE", body: Record<string, unknown>) {
    const response = await request("/api/areas", {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = (await response.json().catch(() => ({}))) as AreasResponse;
    if (!response.ok) {
      throw new Error(data.error ?? "구역을 저장하지 못했습니다.");
    }
    return data;
  }

  function startDraw(first?: [number, number]) {
    setMenu(null);
    setSelected(null);
    setMode({ kind: "draw", points: first ? [first] : [] });
  }

  function finishDraw(points: Array<[number, number]>) {
    const ring = ringFromPoints(points);
    if (ring.length < 4) {
      say("꼭짓점을 3개 이상 찍어 주세요.");
      return;
    }
    setMode(null);
    setAreaError("");
    setAreaDraft({
      id: null,
      name: "",
      color: AREA_COLORS[0],
      memo: "",
      geometry: { type: "Polygon", coordinates: [ring] },
      createdByMemberId: null,
      createdByName: "",
    });
  }

  async function saveArea() {
    if (!areaDraft) {
      return;
    }
    setSavingArea(true);
    setAreaError("");
    try {
      const body = areaDraft.id
        ? { id: areaDraft.id, name: areaDraft.name, color: areaDraft.color, memo: areaDraft.memo }
        : { name: areaDraft.name, color: areaDraft.color, memo: areaDraft.memo, geometry: areaDraft.geometry, source: "draw" };
      const data = await areaRequest(areaDraft.id ? "PATCH" : "POST", body);
      const saved = data.area;
      if (saved) {
        setAreas((current) => [...current.filter((area) => area.id !== saved.id), saved]);
        setSelected({ kind: "area", id: saved.id });
        setShowAreas(true);
        if (!areaDraft.id) {
          say(`‘${saved.name}’ 구역을 저장했습니다 (${shortArea(saved.areaM2)}).`);
        }
      }
      setAreaDraft(null);
    } catch (saveError) {
      setAreaError(saveError instanceof Error ? saveError.message : "구역을 저장하지 못했습니다.");
    } finally {
      setSavingArea(false);
    }
  }

  async function deleteArea(area: MapArea) {
    if (!window.confirm(`'${area.name}' 구역을 삭제할까요?`)) {
      return;
    }
    try {
      await areaRequest("DELETE", { id: area.id });
      setAreas((current) => current.filter((entry) => entry.id !== area.id));
      setSelected(null);
      setAreaDraft((current) => (current?.id === area.id ? null : current));
      say(`‘${area.name}’ 구역을 삭제했습니다.`);
    } catch (deleteError) {
      say(deleteError instanceof Error ? deleteError.message : "구역을 삭제하지 못했습니다.");
    }
  }

  function fitGeometries(geometries: AreaGeometry[]) {
    const L = leafletRef.current;
    const map = mapRef.current;
    if (!L || !map || !geometries.length) {
      return;
    }
    const bounds = L.latLngBounds(geometries.flatMap((geometry) => geometryBounds(geometry)));
    map.fitBounds(bounds, { padding: [60, 60], maxZoom: 17 });
  }

  function chooseArea(area: MapArea) {
    setMenu(null);
    setShowAreas(true);
    setSelected({ kind: "area", id: area.id });
    fitGeometries([area.geometry]);
  }

  const previewShp = useCallback((geometries: AreaGeometry[]) => {
    setShpPreview(geometries);
    const L = leafletRef.current;
    const map = mapRef.current;
    if (L && map && geometries.length) {
      map.fitBounds(L.latLngBounds(geometries.flatMap((geometry) => geometryBounds(geometry))), { padding: [60, 60], maxZoom: 17 });
    }
  }, []);

  const closeShp = useCallback(() => {
    setShpFiles(null);
    setShpPreview([]);
    setShpError("");
  }, []);

  async function importShp(imported: ImportedArea[]) {
    setSavingShp(true);
    setShpError("");
    try {
      const saved: MapArea[] = [];
      for (let start = 0; start < imported.length; start += MAX_AREAS_PER_IMPORT) {
        const data = await areaRequest("POST", { areas: imported.slice(start, start + MAX_AREAS_PER_IMPORT) });
        saved.push(...(data.areas ?? []));
      }
      setAreas((current) => [...current, ...saved]);
      setShowAreas(true);
      setTab("areas");
      closeShp();
      say(`SHP에서 구역 ${saved.length}개를 가져왔습니다 (합계 ${shortArea(saved.reduce((sum, area) => sum + area.areaM2, 0))}).`);
      fitGeometries(saved.map((area) => area.geometry));
    } catch (importError) {
      setShpError(importError instanceof Error ? importError.message : "구역을 저장하지 못했습니다.");
    } finally {
      setSavingShp(false);
    }
  }

  function startNewPlace(lat: number, lng: number, overrides: Partial<PlaceDraft> = {}) {
    setMenu(null);
    setMode(null);
    setPlaceError("");
    setPlaceDraft(newPlaceDraft(round(lat), round(lng), overrides));
  }

  function startNewItem(lat: number, lng: number, location = "") {
    setMenu(null);
    setMode(null);
    onCreateItemAt({ lat: round(lat), lng: round(lng), location });
  }

  async function copyCoordinates(lat: number, lng: number) {
    setMenu(null);
    try {
      await navigator.clipboard.writeText(formatCoordinates(lat, lng));
      say(`좌표를 복사했습니다: ${formatCoordinates(lat, lng)}`);
    } catch {
      say(`좌표: ${formatCoordinates(lat, lng)}`);
    }
  }

  function flyTo(lat: number, lng: number, zoom = 15) {
    const map = mapRef.current;
    if (map) {
      map.setView([lat, lng], Math.max(map.getZoom(), zoom));
    }
  }

  function fitAll() {
    const L = leafletRef.current;
    const map = mapRef.current;
    if (!L || !map) {
      return;
    }
    const points: Array<[number, number]> = [
      ...(showItems ? shownPinned.map((item) => [item.lat, item.lng] as [number, number]) : []),
      ...(showPlaces ? visiblePlaces.map((place) => [place.lat, place.lng] as [number, number]) : []),
      ...(showAreas ? areas.flatMap((area) => geometryBounds(area.geometry)) : []),
    ];
    if (!points.length) {
      map.setView(KOREA_CENTER, KOREA_ZOOM);
      return;
    }
    map.fitBounds(L.latLngBounds(points), { padding: [60, 60], maxZoom: 14 });
  }

  function locateMe() {
    if (!navigator.geolocation) {
      say("이 브라우저는 현재 위치를 지원하지 않습니다.");
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const point = { lat: position.coords.latitude, lng: position.coords.longitude };
        setMyLocation(point);
        flyTo(point.lat, point.lng, 14);
      },
      () => say("현재 위치를 가져올 수 없습니다. 브라우저의 위치 권한을 확인해 주세요."),
      { enableHighAccuracy: true, timeout: 10000 }
    );
  }

  function cancelAll() {
    setMenu(null);
    setMode(null);
    setSelected(null);
  }

  // Leaflet handlers read the latest state through this ref.
  useEffect(() => {
    handlersRef.current = {
      pick: (lat, lng, x, y) => {
        if (mode?.kind === "draw") {
          // Double click (or right click) finishes the shape.
          finishDraw([...mode.points, [lat, lng]]);
          return;
        }
        if (mode) {
          handlersRef.current.click(lat, lng);
          return;
        }
        setSelected(null);
        const size = mapRef.current?.getSize();
        setMenu({
          lat,
          lng,
          x,
          y,
          flipX: Boolean(size && x > size.x - 240),
          flipY: Boolean(size && y > size.y - 210),
        });
      },
      click: (lat, lng) => {
        if (mode?.kind === "draw") {
          setMode({ kind: "draw", points: [...mode.points, [lat, lng]] });
          return;
        }
        if (mode?.kind === "assign") {
          const item = items.find((entry) => entry.id === mode.itemId);
          setMode(null);
          if (item) {
            moveItem(item, round(lat), round(lng));
            setSelected({ kind: "item", id: item.id });
          }
          return;
        }
        if (mode?.kind === "new-place") {
          startNewPlace(lat, lng);
          return;
        }
        if (mode?.kind === "repick") {
          setMode(null);
          setPlaceError("");
          setPlaceDraft({ ...mode.draft, lat: round(lat), lng: round(lng) });
          return;
        }
        if (mode?.kind === "new-item") {
          startNewItem(lat, lng);
          return;
        }
        setMenu(null);
        setSelected(null);
      },
      move: (lat, lng) => {
        const rubber = rubberRef.current;
        if (rubber && mode?.kind === "draw" && mode.points.length) {
          const points = mode.points;
          rubber.setLatLngs(points.length > 1 ? [points[points.length - 1], [lat, lng], points[0]] : [points[0], [lat, lng]]);
        }
      },
      area: (id, lat, lng) => {
        if (mode) {
          handlersRef.current.click(lat, lng);
          return;
        }
        setMenu(null);
        setSelected({ kind: "area", id });
      },
      closeMenu: () => setMenu(null),
    };
  });

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !placeDraft && !areaDraft && !shpFiles) {
        cancelAll();
        return;
      }
      const target = event.target as HTMLElement | null;
      const typing = target && /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName);
      if (!typing && mode?.kind === "draw") {
        if (event.key === "Backspace") {
          event.preventDefault();
          setMode({ kind: "draw", points: mode.points.slice(0, -1) });
        } else if (event.key === "Enter") {
          event.preventDefault();
          finishDraw(mode.points);
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [placeDraft, areaDraft, shpFiles, mode]);

  useEffect(() => {
    if (!toast) {
      return;
    }
    const timer = window.setTimeout(() => setToast(null), toast.undo ? 7000 : 3500);
    return () => window.clearTimeout(timer);
  }, [toast]);

  // ------------------------------------------------------------ markers

  useEffect(() => {
    const L = leafletRef.current;
    const itemLayer = itemLayerRef.current;
    const placeLayer = placeLayerRef.current;
    if (!L || !itemLayer || !placeLayer) {
      return;
    }
    itemLayer.clearLayers();
    placeLayer.clearLayers();
    const markers = new Map<string, LeafletNS.Marker>();

    if (showItems) {
      for (const item of shownPinned) {
        const isSelected = selected?.kind === "item" && selected.id === item.id;
        const editable = canEditItem(item);
        const marker = L.marker([item.lat, item.lng], {
          draggable: editable,
          zIndexOffset: isSelected ? 1000 : 0,
          keyboard: true,
          title: item.title || "업무",
          icon: L.divIcon({
            className: `tb-map-pin${isSelected ? " is-selected" : ""}`,
            html: `<span style="--pin-color:${itemColor(item)}">${escapeHtml(String(itemProgress(item)))}</span>`,
            iconSize: [34, 34],
            iconAnchor: [17, 17],
          }),
        }).addTo(itemLayer);
        marker.bindTooltip(escapeHtml(item.title || "업무"), { direction: "top", offset: [0, -14] });
        marker.on("click", () => {
          setMenu(null);
          setSelected({ kind: "item", id: item.id });
        });
        marker.on("dragend", () => {
          const next = marker.getLatLng();
          moveItem(item, round(next.lat), round(next.lng));
        });
        markers.set(`item:${item.id}`, marker);
      }
    }

    if (showPlaces) {
      for (const place of visiblePlaces) {
        const isSelected = selected?.kind === "place" && selected.id === place.id;
        const marker = L.marker([place.lat, place.lng], {
          draggable: canEditPlace(place),
          zIndexOffset: isSelected ? 1100 : 500,
          keyboard: true,
          title: place.name,
          icon: L.divIcon({
            className: `tb-place-pin${isSelected ? " is-selected" : ""}`,
            html: placePinHtml(place),
            iconSize: [32, 32],
            iconAnchor: [16, 37],
          }),
        }).addTo(placeLayer);
        marker.bindTooltip(escapeHtml(place.name), { direction: "top", offset: [0, -34] });
        marker.on("click", () => {
          setMenu(null);
          setSelected({ kind: "place", id: place.id });
        });
        marker.on("dragend", () => {
          const next = marker.getLatLng();
          void movePlace(place, round(next.lat), round(next.lng));
        });
        markers.set(`place:${place.id}`, marker);
      }
    }
    markersRef.current = markers;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shownPinned, visiblePlaces, showItems, showPlaces, selected, ready, isManager, me]);

  // 구역 polygons.
  useEffect(() => {
    const L = leafletRef.current;
    const layer = areaLayerRef.current;
    if (!L || !layer) {
      return;
    }
    layer.clearLayers();
    if (!showAreas) {
      return;
    }
    for (const area of areas) {
      const isSelected = selected?.kind === "area" && selected.id === area.id;
      const shape = L.geoJSON(area.geometry as unknown as GeoJSON.GeoJsonObject, {
        style: {
          color: area.color,
          weight: isSelected ? 3.5 : 2,
          opacity: 0.95,
          fillColor: area.color,
          fillOpacity: isSelected ? 0.32 : 0.16,
        },
      }).addTo(layer);
      shape.bindTooltip(`${escapeHtml(area.name)} · ${shortArea(area.areaM2)}`, { sticky: true });
      shape.on("click", (event: LeafletNS.LeafletMouseEvent) => {
        L.DomEvent.stopPropagation(event);
        handlersRef.current.area(area.id, event.latlng.lat, event.latlng.lng);
      });
      if (isSelected) {
        shape.bringToFront();
      }
    }
  }, [areas, ready, selected, showAreas]);

  // Shape being drawn, and the SHP import preview.
  useEffect(() => {
    const L = leafletRef.current;
    const layer = drawLayerRef.current;
    if (!L || !layer) {
      return;
    }
    layer.clearLayers();
    rubberRef.current = null;
    for (const geometry of shpPreview) {
      L.geoJSON(geometry as unknown as GeoJSON.GeoJsonObject, {
        interactive: false,
        style: { color: "#ea580c", weight: 2, dashArray: "6 4", fillColor: "#ea580c", fillOpacity: 0.12 },
      }).addTo(layer);
    }
    if (mode?.kind !== "draw") {
      return;
    }
    const style = { color: "#ea580c", weight: 2.5, interactive: false };
    if (mode.points.length >= 3) {
      L.polygon(mode.points, { ...style, fillColor: "#ea580c", fillOpacity: 0.15 }).addTo(layer);
    } else if (mode.points.length === 2) {
      L.polyline(mode.points, style).addTo(layer);
    }
    rubberRef.current = L.polyline([], { ...style, dashArray: "5 5", weight: 1.5 }).addTo(layer);
    mode.points.forEach((point, index) => {
      L.circleMarker(point, {
        radius: index === 0 ? 6 : 4.5,
        color: "#ea580c",
        weight: 2,
        fillColor: "#fff",
        fillOpacity: 1,
        interactive: index === 0 && mode.points.length >= 3,
      })
        .on("click", (event: LeafletNS.LeafletMouseEvent) => {
          // Clicking the first corner closes the shape.
          L.DomEvent.stopPropagation(event);
          finishDraw(mode.points);
        })
        .addTo(layer);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, ready, shpPreview]);

  // Temporary markers: the spot of the open menu, a search result, my location.
  useEffect(() => {
    const L = leafletRef.current;
    const layer = tempLayerRef.current;
    if (!L || !layer) {
      return;
    }
    layer.clearLayers();
    if (menu) {
      L.marker([menu.lat, menu.lng], {
        interactive: false,
        icon: L.divIcon({ className: "tb-map-drop", html: "<span></span>", iconSize: [22, 22], iconAnchor: [11, 11] }),
      }).addTo(layer);
    }
    if (selected?.kind === "result") {
      L.marker([selected.result.lat, selected.result.lng], {
        interactive: false,
        icon: L.divIcon({ className: "tb-map-result", html: "<span>📍</span>", iconSize: [30, 30], iconAnchor: [15, 28] }),
      }).addTo(layer);
    }
    if (myLocation) {
      L.circleMarker([myLocation.lat, myLocation.lng], {
        radius: 8,
        color: "#fff",
        weight: 3,
        fillColor: "#2563eb",
        fillOpacity: 1,
      })
        .bindTooltip("내 위치")
        .addTo(layer);
    }
  }, [menu, myLocation, ready, selected]);

  // First look: fit everything that has a pin (unless a focus says otherwise).
  useEffect(() => {
    if (!ready || fittedRef.current || focus) {
      return;
    }
    fittedRef.current = true;
    const timer = window.setTimeout(() => fitAll(), 0);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready]);

  // Focus from elsewhere: 통합 검색 (장소), the dashboard's 지역 현황, …
  useEffect(() => {
    if (!focus || !ready || !mapRef.current) {
      return;
    }
    const timer = window.setTimeout(() => {
      fittedRef.current = true;
      onFocusHandled();
      if ("placeId" in focus) {
        const place = places.find((entry) => entry.id === focus.placeId);
        if (place) {
          setShowPlaces(true);
          setHiddenKinds((current) => {
            const label = placeKindOf(place).label;
            if (!current.has(label)) {
              return current;
            }
            const next = new Set(current);
            next.delete(label);
            return next;
          });
          setSelected({ kind: "place", id: place.id });
          setTab("places");
          flyTo(place.lat, place.lng, 15);
        }
      } else if ("itemId" in focus) {
        const item = items.find((entry) => entry.id === focus.itemId);
        if (item && located(item)) {
          setShowItems(true);
          setSelected({ kind: "item", id: item.id });
          flyTo(item.lat, item.lng, 14);
        }
      } else {
        mapRef.current?.setView([focus.lat, focus.lng], focus.zoom ?? 11);
      }
    }, 0);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focus, ready]);

  // ------------------------------------------------------------ search

  const needle = query.trim().toLocaleLowerCase("ko-KR");
  const localMatches = needle
    ? {
        items: pinned
          .filter((item) => `${item.title} ${item.location} ${item.assignee}`.toLocaleLowerCase("ko-KR").includes(needle))
          .slice(0, 6),
        places: places
          .filter((place) =>
            `${place.name} ${place.address} ${placeKindOf(place).label}`.toLocaleLowerCase("ko-KR").includes(needle)
          )
          .slice(0, 6),
        areas: areas.filter((area) => `${area.name} ${area.memo}`.toLocaleLowerCase("ko-KR").includes(needle)).slice(0, 6),
      }
    : { items: [], places: [], areas: [] };

  async function runGeoSearch() {
    const text = query.trim();
    if (!text) {
      return;
    }
    setGeoSearching(true);
    setGeoError("");
    try {
      const results = await searchPlaceNames(text, vworldKey);
      setGeoResults({ query: text, results });
      if (!results.length) {
        setGeoError("지명 검색 결과가 없습니다.");
      }
    } catch (searchError) {
      setGeoResults({ query: text, results: [] });
      setGeoError(searchError instanceof Error ? searchError.message : "지명을 검색하지 못했습니다.");
    } finally {
      setGeoSearching(false);
    }
  }

  function chooseResult(result: MapSearchResult) {
    setMenu(null);
    setSelected({ kind: "result", result });
    flyTo(result.lat, result.lng, 14);
  }

  function chooseItem(item: WorkflowItem & { lat: number; lng: number }) {
    setMenu(null);
    setShowItems(true);
    setItemHidden(item.id, false);
    setSelected({ kind: "item", id: item.id });
    flyTo(item.lat, item.lng, 14);
  }

  function choosePlace(place: MapPlace) {
    setMenu(null);
    setShowPlaces(true);
    setSelected({ kind: "place", id: place.id });
    flyTo(place.lat, place.lng, 15);
  }

  function highlight(key: string, on: boolean) {
    markersRef.current.get(key)?.getElement()?.classList.toggle("is-hover", on);
  }

  // ------------------------------------------------------------ render

  const selectedItem = selected?.kind === "item" ? items.find((item) => item.id === selected.id) ?? null : null;
  const selectedPlace = selected?.kind === "place" ? places.find((place) => place.id === selected.id) ?? null : null;
  const selectedArea = selected?.kind === "area" ? areas.find((area) => area.id === selected.id) ?? null : null;
  const drawRing = mode?.kind === "draw" ? ringFromPoints(mode.points) : [];
  const drawGeometry: AreaGeometry | null = drawRing.length >= 4 ? { type: "Polygon", coordinates: [drawRing] } : null;
  const assigningItem = mode?.kind === "assign" ? items.find((item) => item.id === mode.itemId) ?? null : null;
  const modeText =
    mode?.kind === "assign"
      ? `지도를 클릭해 ‘${assigningItem?.title || "업무"}’의 위치를 지정하세요`
      : mode?.kind === "new-place"
        ? "지도를 클릭해 새 장소의 위치를 고르세요"
        : mode?.kind === "repick"
          ? `지도를 클릭해 ‘${mode.draft.name || "장소"}’의 새 위치를 고르세요`
          : mode?.kind === "new-item"
            ? "지도를 클릭해 새 업무의 위치를 고르세요"
            : "";

  const panelList =
    tab === "items" ? (
      <div className="space-y-0.5">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 px-2 pb-1.5 text-[11px] text-[var(--text-faint)]">
          {STATUS_COLORS.map((entry) => (
            <span key={entry.label} className="inline-flex items-center gap-1">
              <span className="h-2.5 w-2.5 rounded-full" style={{ background: entry.color }} />
              {entry.label}
            </span>
          ))}
        </div>
        {pinned.length ? (
          <div className="flex items-center gap-2 px-2 pb-1 text-[11px] text-[var(--text-faint)]">
            <span>{hiddenPinnedCount ? `${hiddenPinnedCount}개 숨김` : "모든 핀 표시 중"}</span>
            <button
              type="button"
              className="ml-auto font-semibold text-[var(--accent)] hover:underline disabled:opacity-40"
              disabled={!hiddenPinnedCount}
              onClick={() => setHiddenItemIds(new Set())}
            >
              모두 표시
            </button>
            <button
              type="button"
              className="font-semibold text-[var(--accent)] hover:underline disabled:opacity-40"
              disabled={hiddenPinnedCount === pinned.length}
              onClick={() => {
                setHiddenItemIds(new Set(pinned.map((item) => item.id)));
                setSelected((current) => (current?.kind === "item" ? null : current));
              }}
            >
              모두 숨기기
            </button>
          </div>
        ) : null}
        {pinned.map((item) => {
          const hidden = hiddenItemIds.has(item.id);
          return (
          <div key={item.id} className="flex items-center gap-0.5" data-hidden={hidden}>
          <button
            type="button"
            onClick={() => chooseItem(item)}
            onMouseEnter={() => highlight(`item:${item.id}`, true)}
            onMouseLeave={() => highlight(`item:${item.id}`, false)}
            data-active={selected?.kind === "item" && selected.id === item.id}
            className={`tb-map-row min-w-0 flex-1 ${hidden ? "opacity-45" : ""}`}
          >
            <span className="tb-map-row-dot" style={{ background: itemColor(item) }}>
              {itemProgress(item)}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-medium">{item.title || "제목 없음"}</span>
              <span className="block truncate text-[11px] text-[var(--text-faint)]">
                {assigneeName(item.assignee)}
                {item.location ? ` · ${item.location}` : ""}
              </span>
            </span>
          </button>
          <button
            type="button"
            className="tb-iconbtn h-8 w-8 shrink-0 text-sm"
            aria-pressed={!hidden}
            aria-label={`${item.title || "업무"} 핀 ${hidden ? "켜기" : "끄기"}`}
            title={hidden ? "지도에 핀 표시" : "지도에서 핀 숨기기"}
            onClick={() => {
              setItemHidden(item.id, !hidden);
              if (!hidden && selected?.kind === "item" && selected.id === item.id) {
                setSelected(null);
              }
            }}
          >
            {hidden ? "◌" : "◉"}
          </button>
          </div>
          );
        })}
        {!pinned.length ? (
          <div className="px-2 py-6 text-center text-sm text-[var(--text-faint)]">
            지도에 표시된 업무가 없습니다.
            <br />
            ‘위치 미지정’ 탭에서 위치를 지정하거나 지도를 더블클릭해 추가하세요.
          </div>
        ) : null}
      </div>
    ) : tab === "places" ? (
      <div className="space-y-1">
        {kinds.length ? (
          <div className="flex flex-wrap gap-1 px-1 pb-1" aria-label="장소 유형 표시">
            {kinds.map((kind) => {
              const off = hiddenKinds.has(kind.label);
              return (
                <button
                  key={kind.label}
                  type="button"
                  aria-pressed={!off}
                  onClick={() =>
                    setHiddenKinds((current) => {
                      const next = new Set(current);
                      if (next.has(kind.label)) {
                        next.delete(kind.label);
                      } else {
                        next.add(kind.label);
                      }
                      return next;
                    })
                  }
                  className="tb-chip tb-chip-btn !text-[11px]"
                  style={off ? { opacity: 0.45 } : { borderColor: kind.color }}
                  title={off ? `${kind.label} 표시` : `${kind.label} 숨기기`}
                >
                  <span aria-hidden="true">{kind.icon}</span>
                  {kind.label}
                  <span className="text-[var(--text-faint)]">{kind.count}</span>
                </button>
              );
            })}
          </div>
        ) : null}
        {visiblePlaces
          .slice()
          .sort(
            (first, second) =>
              PLACE_KINDS.findIndex((kind) => kind.key === first.kind) - PLACE_KINDS.findIndex((kind) => kind.key === second.kind) ||
              first.name.localeCompare(second.name, "ko-KR")
          )
          .map((place) => {
            const kind = placeKindOf(place);
            return (
              <button
                key={place.id}
                type="button"
                onClick={() => choosePlace(place)}
                onMouseEnter={() => highlight(`place:${place.id}`, true)}
                onMouseLeave={() => highlight(`place:${place.id}`, false)}
                data-active={selected?.kind === "place" && selected.id === place.id}
                className="tb-map-row"
              >
                <span className="tb-map-row-icon" style={{ borderColor: kind.color }} aria-hidden="true">
                  {kind.icon}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">{place.name}</span>
                  <span className="block truncate text-[11px] text-[var(--text-faint)]">
                    {kind.label}
                    {place.address ? ` · ${place.address}` : ""}
                  </span>
                </span>
              </button>
            );
          })}
        {!places.length ? (
          <div className="px-2 py-6 text-center text-sm text-[var(--text-faint)]">
            등록된 장소가 없습니다.
            <br />
            지도를 더블클릭(휴대폰은 길게 누르기)해 사무실·현장 등을 추가하세요.
          </div>
        ) : null}
      </div>
    ) : tab === "areas" ? (
      <div className="space-y-0.5">
        <div className="flex gap-1.5 px-1 pb-1.5">
          <button type="button" className="tb-btn flex-1 !px-2 !py-1.5 text-xs" onClick={() => startDraw()}>
            ⬠ 구역 그리기
          </button>
          <button type="button" className="tb-btn flex-1 !px-2 !py-1.5 text-xs" onClick={() => shpInputRef.current?.click()}>
            ⇪ SHP 올리기
          </button>
        </div>
        {areas.length ? (
          <div className="px-2 pb-1 text-[11px] text-[var(--text-faint)]">
            {areas.length}개 · 합계 {formatArea(areaTotal)}
          </div>
        ) : null}
        {sortedAreas.map((area) => (
          <button
            key={area.id}
            type="button"
            onClick={() => chooseArea(area)}
            data-active={selected?.kind === "area" && selected.id === area.id}
            className="tb-map-row"
          >
            <span className="tb-map-row-icon" style={{ borderColor: area.color, background: `${area.color}2e` }} aria-hidden="true">
              ⬠
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-medium">{area.name}</span>
              <span className="block truncate text-[11px] text-[var(--text-faint)]">
                {formatArea(area.areaM2).split(" · ").slice(0, 3).join(" · ")}
                {area.source === "shp" ? " · SHP" : ""}
              </span>
            </span>
          </button>
        ))}
        {!areas.length ? (
          <div className="px-2 py-6 text-center text-sm text-[var(--text-faint)]">
            등록된 구역이 없습니다.
            <br />
            ‘구역 그리기’로 지도에 꼭짓점을 찍거나, Shapefile(.zip 또는 .shp·.dbf·.prj)을 올리세요.
          </div>
        ) : null}
      </div>
    ) : (
      <div className="space-y-0.5">
        {unplaced.map((item) => (
          <div key={item.id} className="tb-map-row !cursor-default">
            <span className="min-w-0 flex-1">
              <button
                type="button"
                onClick={() => onOpenItem(item.id)}
                className="block w-full truncate text-left text-sm font-medium hover:text-[var(--accent)]"
                title="업무 열기"
              >
                {item.title || "제목 없음"}
              </button>
              <span className="block truncate text-[11px] text-[var(--text-faint)]">{assigneeName(item.assignee)}</span>
            </span>
            <button
              type="button"
              disabled={!canEditItem(item)}
              onClick={() => {
                setSelected(null);
                setMenu(null);
                setMode({ kind: "assign", itemId: item.id });
              }}
              className="tb-btn shrink-0 !px-2 !py-1 text-xs disabled:opacity-40"
              title={canEditItem(item) ? "지도를 클릭해 위치 지정" : "담당자 또는 부서장만 위치를 정할 수 있습니다"}
            >
              📍 지정
            </button>
          </div>
        ))}
        {!unplaced.length ? (
          <div className="px-2 py-6 text-center text-sm text-[var(--text-faint)]">모든 업무에 위치가 있습니다.</div>
        ) : null}
      </div>
    );

  return (
    <div className="tb-map-app relative h-full overflow-hidden" data-testid="map-view">
      <div ref={containerRef} className="tb-map-canvas absolute inset-0" aria-label="지도" />

      {/* Left panel: search + lists (bottom sheet on phones). */}
      <section className="tb-map-panel" data-open={panelOpen} aria-label="지도 목록">
        <div className="flex items-center gap-1.5 p-2">
          <form
            className="relative min-w-0 flex-1"
            onSubmit={(event) => {
              event.preventDefault();
              void runGeoSearch();
            }}
          >
            <svg className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-faint)]" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
              <circle cx="11" cy="11" r="8" />
              <path d="m21 21-4.3-4.3" />
            </svg>
            <input
              value={query}
              onChange={(event) => {
                setQuery(event.target.value);
                setGeoResults(null);
                setGeoError("");
                setPanelOpen(true);
              }}
              onKeyDown={(event) => {
                if (event.key === "Escape") {
                  setQuery("");
                  setGeoResults(null);
                }
              }}
              placeholder="업무·장소·지명 검색"
              aria-label="지도 검색"
              className="tb-field !rounded-full !py-2 pl-9 pr-8"
            />
            {query ? (
              <button
                type="button"
                className="absolute right-2 top-1/2 -translate-y-1/2 px-1 text-[var(--text-faint)]"
                aria-label="검색어 지우기"
                onClick={() => {
                  setQuery("");
                  setGeoResults(null);
                  setGeoError("");
                }}
              >
                ×
              </button>
            ) : null}
          </form>
          <button
            type="button"
            className="tb-iconbtn h-9 w-9 shrink-0"
            onClick={() => setPanelOpen((value) => !value)}
            aria-label={panelOpen ? "목록 접기" : "목록 펼치기"}
            title={panelOpen ? "목록 접기" : "목록 펼치기"}
          >
            {panelOpen ? "▴" : "▾"}
          </button>
        </div>

        {panelOpen ? (
          <>
            {needle ? (
              <div className="tb-map-panel-body" data-testid="map-search-results">
                {localMatches.items.length || localMatches.places.length || localMatches.areas.length ? (
                  <div className="pb-1">
                    <div className="px-3 pb-1 text-[11px] font-semibold text-[var(--text-faint)]">이 보드</div>
                    {localMatches.places.map((place) => (
                      <button key={`p${place.id}`} type="button" className="tb-map-row" onClick={() => choosePlace(place)}>
                        <span className="tb-map-row-icon" style={{ borderColor: placeKindOf(place).color }} aria-hidden="true">
                          {placeKindOf(place).icon}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-medium">{place.name}</span>
                          <span className="block truncate text-[11px] text-[var(--text-faint)]">장소 · {placeKindOf(place).label}</span>
                        </span>
                      </button>
                    ))}
                    {localMatches.areas.map((area) => (
                      <button key={`a${area.id}`} type="button" className="tb-map-row" onClick={() => chooseArea(area)}>
                        <span className="tb-map-row-icon" style={{ borderColor: area.color }} aria-hidden="true">
                          ⬠
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-medium">{area.name}</span>
                          <span className="block truncate text-[11px] text-[var(--text-faint)]">구역 · {shortArea(area.areaM2)}</span>
                        </span>
                      </button>
                    ))}
                    {localMatches.items.map((item) => (
                      <button key={`i${item.id}`} type="button" className="tb-map-row" onClick={() => chooseItem(item)}>
                        <span className="tb-map-row-dot" style={{ background: itemColor(item) }}>
                          {itemProgress(item)}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-medium">{item.title}</span>
                          <span className="block truncate text-[11px] text-[var(--text-faint)]">
                            업무 · {assigneeName(item.assignee)}
                          </span>
                        </span>
                      </button>
                    ))}
                  </div>
                ) : null}
                <div className="border-t border-[var(--border)] pt-1">
                  <div className="px-3 pb-1 pt-1 text-[11px] font-semibold text-[var(--text-faint)]">지명</div>
                  {geoResults?.query === query.trim() ? (
                    geoResults.results.map((result) => (
                      <button
                        key={`${result.source}-${result.lat}-${result.lng}`}
                        type="button"
                        className="tb-map-row"
                        onClick={() => chooseResult(result)}
                      >
                        <span className="tb-map-row-icon" aria-hidden="true">
                          📍
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="line-clamp-2 text-sm">{result.label}</span>
                          <span className="block text-[10.5px] text-[var(--text-faint)]">{result.source}</span>
                        </span>
                      </button>
                    ))
                  ) : (
                    <button type="button" className="tb-map-row" onClick={() => void runGeoSearch()} disabled={geoSearching}>
                      <span className="tb-map-row-icon" aria-hidden="true">
                        🔎
                      </span>
                      <span className="text-sm text-[var(--accent)]">
                        {geoSearching ? "지명 찾는 중…" : `‘${query.trim()}’ 지명 검색 (Enter)`}
                      </span>
                    </button>
                  )}
                  {geoError ? <div className="px-3 py-1 text-xs text-[var(--text-faint)]">{geoError}</div> : null}
                </div>
              </div>
            ) : (
              <>
                <div className="flex border-b border-[var(--border)] px-2" role="tablist">
                  {(
                    [
                      ["items", `업무 ${pinned.length}`],
                      ["places", `장소 ${places.length}`],
                      ["areas", `구역 ${areas.length}`],
                      ["unplaced", `미지정 ${unplaced.length}`],
                    ] as Array<[Tab, string]>
                  ).map(([key, label]) => (
                    <button
                      key={key}
                      type="button"
                      role="tab"
                      aria-selected={tab === key}
                      onClick={() => setTab(key)}
                      className="tb-map-tab"
                    >
                      {label}
                    </button>
                  ))}
                </div>
                <div className="tb-map-panel-body">{panelList}</div>
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-[var(--border)] px-3 py-2 text-xs text-[var(--text-muted)]">
                  <label className="inline-flex items-center gap-1.5">
                    <input type="checkbox" checked={showItems} onChange={(event) => setShowItems(event.target.checked)} />
                    업무 핀
                  </label>
                  <label className="inline-flex items-center gap-1.5">
                    <input type="checkbox" checked={showPlaces} onChange={(event) => setShowPlaces(event.target.checked)} />
                    장소 핀
                  </label>
                  <label className="inline-flex items-center gap-1.5">
                    <input type="checkbox" checked={showAreas} onChange={(event) => setShowAreas(event.target.checked)} />
                    구역
                  </label>
                  <span className="ml-auto text-[11px] text-[var(--text-faint)]">더블클릭으로 추가</span>
                </div>
              </>
            )}
          </>
        ) : null}
      </section>

      {/* Top-right: style switch, settings. */}
      <div className="tb-map-topright">
        <div className="tb-map-seg" role="group" aria-label="지도 종류">
          {(Object.keys(MAP_STYLE_LABELS) as MapStyle[]).map((style) => (
            <button key={style} type="button" data-active={mapStyle === style} onClick={() => onStyleChange(style)}>
              {MAP_STYLE_LABELS[style]}
            </button>
          ))}
        </div>
        <button type="button" className="tb-map-fab" onClick={onOpenSettings} title="지도 설정 (지도 제공자·API 키)" aria-label="지도 설정">
          ⚙
        </button>
      </div>

      {/* Right column: quick actions. */}
      <div className="tb-map-fabs">
        <button
          type="button"
          className="tb-map-fab"
          onClick={() => {
            cancelAll();
            setMode({ kind: "new-place" });
          }}
          title="장소 추가 (지도를 더블클릭해도 됩니다)"
          aria-label="장소 추가"
        >
          📌
        </button>
        <button
          type="button"
          className="tb-map-fab"
          onClick={() => {
            cancelAll();
            startDraw();
          }}
          title="구역 그리기: 꼭짓점을 클릭하고 더블클릭으로 완료 (면적 자동 계산)"
          aria-label="구역 그리기"
        >
          ⬠
        </button>
        {canCreateItems ? (
          <button
            type="button"
            className="tb-map-fab"
            onClick={() => {
              cancelAll();
              setMode({ kind: "new-item" });
            }}
            title="업무 추가 (지도를 더블클릭해도 됩니다)"
            aria-label="업무 추가"
          >
            ＋
          </button>
        ) : null}
        <button type="button" className="tb-map-fab" onClick={locateMe} title="내 위치" aria-label="내 위치">
          ◎
        </button>
        <button type="button" className="tb-map-fab" onClick={fitAll} title="모든 핀이 보이게" aria-label="전체 보기">
          ⤢
        </button>
      </div>

      {mode?.kind === "draw" ? (
        <div className="tb-map-banner tb-map-banner-draw" role="status" data-testid="draw-banner">
          <span className="min-w-0">
            <b>구역 그리기</b> · 클릭으로 꼭짓점 {mode.points.length}개
            {drawGeometry ? (
              <>
                {" · "}
                <b data-testid="draw-area">{formatArea(geometryArea(drawGeometry)).split(" · ").slice(0, 2).join(" · ")}</b>
                {" · 둘레 "}
                {formatLength(geometryPerimeter(drawGeometry))}
              </>
            ) : (
              " · 더블클릭(또는 첫 점 클릭)으로 완료"
            )}
          </span>
          <span className="flex shrink-0 gap-1">
            <button
              type="button"
              className="tb-btn tb-btn-primary !px-2 !py-0.5 text-xs"
              disabled={!drawGeometry}
              onClick={() => finishDraw(mode.points)}
            >
              완료
            </button>
            <button
              type="button"
              className="tb-btn !px-2 !py-0.5 text-xs"
              disabled={!mode.points.length}
              onClick={() => setMode({ kind: "draw", points: mode.points.slice(0, -1) })}
              title="마지막 점 취소 (Backspace)"
            >
              ↶ 점 취소
            </button>
            <button type="button" className="tb-btn !px-2 !py-0.5 text-xs" onClick={() => setMode(null)}>
              취소
            </button>
          </span>
        </div>
      ) : modeText ? (
        <div className="tb-map-banner" role="status">
          <span>🖱 {modeText}</span>
          <button type="button" className="tb-btn !px-2 !py-0.5 text-xs" onClick={() => setMode(null)}>
            취소 (Esc)
          </button>
        </div>
      ) : null}

      {/* "Add here" menu: double click, right click or long press. */}
      {menu ? (
        <div
          className="tb-map-menu"
          role="menu"
          aria-label="이 위치에서"
          style={{
            left: menu.x,
            top: menu.y,
            transform: `translate(${menu.flipX ? "calc(-100% - 8px)" : "8px"}, ${menu.flipY ? "calc(-100% - 8px)" : "8px"})`,
          }}
          onContextMenu={(event) => event.preventDefault()}
        >
          <div className="px-3 pb-1 pt-1.5 text-[11px] text-[var(--text-faint)]">{formatCoordinates(menu.lat, menu.lng)}</div>
          <button type="button" role="menuitem" className="tb-menu-item" onClick={() => startNewPlace(menu.lat, menu.lng)}>
            <span className="w-5 text-center">📌</span>여기에 장소 추가
          </button>
          {canCreateItems ? (
            <button type="button" role="menuitem" className="tb-menu-item" onClick={() => startNewItem(menu.lat, menu.lng)}>
              <span className="w-5 text-center">📋</span>여기에 업무 추가
            </button>
          ) : null}
          <button type="button" role="menuitem" className="tb-menu-item" onClick={() => startDraw([menu.lat, menu.lng])}>
            <span className="w-5 text-center">⬠</span>여기서 구역 그리기
          </button>
          <button type="button" role="menuitem" className="tb-menu-item" onClick={() => void copyCoordinates(menu.lat, menu.lng)}>
            <span className="w-5 text-center">⧉</span>좌표 복사
          </button>
          <button
            type="button"
            role="menuitem"
            className="tb-menu-item"
            onClick={() => {
              setMenu(null);
              mapRef.current?.setView([menu.lat, menu.lng], Math.min((mapRef.current?.getZoom() ?? 12) + 2, 18));
            }}
          >
            <span className="w-5 text-center">⊕</span>여기로 확대
          </button>
        </div>
      ) : null}

      {/* Info card for the selected pin / search result. */}
      {selectedItem && located(selectedItem) ? (
        <div className="tb-map-card" role="dialog" aria-label={`업무 ${selectedItem.title}`} data-testid="map-card">
          <div className="flex items-start gap-2">
            <span className="tb-map-row-dot mt-0.5" style={{ background: itemColor(selectedItem) }}>
              {itemProgress(selectedItem)}
            </span>
            <div className="min-w-0 flex-1">
              <div className="truncate text-[15px] font-semibold">{selectedItem.title || "제목 없음"}</div>
              <div className="text-xs text-[var(--text-muted)]">
                {assigneeName(selectedItem.assignee)} · 진행 {itemProgress(selectedItem)}%
                {nextStep(selectedItem) ? ` · 다음: ${nextStep(selectedItem)?.title}` : ""}
                {selectedItem.dueDate ? ` · 마감 ${selectedItem.dueDate}` : ""}
              </div>
              <div className="mt-0.5 truncate text-[11px] text-[var(--text-faint)]">
                📍 {selectedItem.location || "이름 없는 위치"} · {formatCoordinates(selectedItem.lat, selectedItem.lng)}
              </div>
            </div>
            <button type="button" className="tb-iconbtn h-7 w-7 shrink-0" aria-label="닫기" onClick={() => setSelected(null)}>
              ×
            </button>
          </div>
          <div className="mt-2.5 flex flex-wrap gap-1.5">
            <button type="button" className="tb-btn tb-btn-primary !px-3 !py-1 text-xs" onClick={() => onOpenItem(selectedItem.id)}>
              업무 열기
            </button>
            {canEditItem(selectedItem) ? (
              <>
                <button
                  type="button"
                  className="tb-btn !px-3 !py-1 text-xs"
                  onClick={() => {
                    setSelected(null);
                    setMode({ kind: "assign", itemId: selectedItem.id });
                  }}
                >
                  위치 다시 지정
                </button>
                <button
                  type="button"
                  className="tb-btn !px-3 !py-1 text-xs text-[var(--danger)]"
                  onClick={() => {
                    setSelected(null);
                    onClearItemPin(selectedItem);
                  }}
                >
                  핀 삭제
                </button>
              </>
            ) : null}
            <DirectionLinks name={selectedItem.location || selectedItem.title} lat={selectedItem.lat} lng={selectedItem.lng} onCopy={copyCoordinates} />
          </div>
          {canEditItem(selectedItem) ? (
            <div className="mt-1.5 text-[11px] text-[var(--text-faint)]">핀을 끌어 옮기면 바로 저장되고, 되돌릴 수 있습니다.</div>
          ) : null}
        </div>
      ) : selectedPlace ? (
        <div className="tb-map-card" role="dialog" aria-label={`장소 ${selectedPlace.name}`} data-testid="map-card">
          <div className="flex items-start gap-2">
            <span className="tb-map-row-icon mt-0.5" style={{ borderColor: placeKindOf(selectedPlace).color }} aria-hidden="true">
              {placeKindOf(selectedPlace).icon}
            </span>
            <div className="min-w-0 flex-1">
              <div className="truncate text-[15px] font-semibold">{selectedPlace.name}</div>
              <div className="text-xs font-semibold" style={{ color: placeKindOf(selectedPlace).color }}>
                {placeKindOf(selectedPlace).label}
              </div>
              {selectedPlace.address ? <div className="mt-0.5 text-xs text-[var(--text-muted)]">{selectedPlace.address}</div> : null}
              {selectedPlace.memo ? <div className="mt-1 whitespace-pre-wrap text-xs">{selectedPlace.memo}</div> : null}
              <div className="mt-0.5 text-[11px] text-[var(--text-faint)]">
                {formatCoordinates(selectedPlace.lat, selectedPlace.lng)} · 등록 {selectedPlace.createdByName}
              </div>
            </div>
            <button type="button" className="tb-iconbtn h-7 w-7 shrink-0" aria-label="닫기" onClick={() => setSelected(null)}>
              ×
            </button>
          </div>
          <div className="mt-2.5 flex flex-wrap gap-1.5">
            <button
              type="button"
              className="tb-btn tb-btn-primary !px-3 !py-1 text-xs"
              onClick={() => {
                setPlaceError("");
                setPlaceDraft(draftFromPlace(selectedPlace));
              }}
            >
              {canEditPlace(selectedPlace) ? "수정" : "자세히"}
            </button>
            {canEditPlace(selectedPlace) ? (
              <button type="button" className="tb-btn !px-3 !py-1 text-xs text-[var(--danger)]" onClick={() => void deletePlace(selectedPlace)}>
                삭제
              </button>
            ) : null}
            <DirectionLinks name={selectedPlace.name} lat={selectedPlace.lat} lng={selectedPlace.lng} onCopy={copyCoordinates} />
          </div>
        </div>
      ) : selectedArea ? (
        <div className="tb-map-card" role="dialog" aria-label={`구역 ${selectedArea.name}`} data-testid="map-card">
          <div className="flex items-start gap-2">
            <span className="tb-map-row-icon mt-0.5" style={{ borderColor: selectedArea.color, background: `${selectedArea.color}2e` }} aria-hidden="true">
              ⬠
            </span>
            <div className="min-w-0 flex-1">
              <div className="truncate text-[15px] font-semibold">{selectedArea.name}</div>
              <div className="text-sm font-semibold" style={{ color: selectedArea.color }} data-testid="area-size">
                {formatArea(selectedArea.areaM2)}
              </div>
              <div className="text-xs text-[var(--text-muted)]">
                둘레 {formatLength(selectedArea.perimeterM)} · 꼭짓점 {vertexCount(selectedArea.geometry).toLocaleString("ko-KR")}개
                {selectedArea.source === "shp" ? " · SHP" : ""}
              </div>
              {selectedArea.memo ? <div className="mt-1 whitespace-pre-wrap text-xs">{selectedArea.memo}</div> : null}
              <div className="mt-0.5 text-[11px] text-[var(--text-faint)]">등록 {selectedArea.createdByName}</div>
            </div>
            <button type="button" className="tb-iconbtn h-7 w-7 shrink-0" aria-label="닫기" onClick={() => setSelected(null)}>
              ×
            </button>
          </div>
          <div className="mt-2.5 flex flex-wrap gap-1.5">
            <button
              type="button"
              className="tb-btn tb-btn-primary !px-3 !py-1 text-xs"
              onClick={() => {
                setAreaError("");
                setAreaDraft({
                  id: selectedArea.id,
                  name: selectedArea.name,
                  color: selectedArea.color,
                  memo: selectedArea.memo,
                  geometry: selectedArea.geometry,
                  createdByMemberId: selectedArea.createdByMemberId,
                  createdByName: selectedArea.createdByName,
                });
              }}
            >
              {canEditArea(selectedArea) ? "수정" : "자세히"}
            </button>
            {canEditArea(selectedArea) ? (
              <button type="button" className="tb-btn !px-3 !py-1 text-xs text-[var(--danger)]" onClick={() => void deleteArea(selectedArea)}>
                삭제
              </button>
            ) : null}
            <button type="button" className="tb-btn !px-3 !py-1 text-xs" onClick={() => fitGeometries([selectedArea.geometry])}>
              영역 보기
            </button>
            <button type="button" className="tb-btn !px-3 !py-1 text-xs" onClick={() => downloadGeoJson(selectedArea)}>
              GeoJSON
            </button>
          </div>
        </div>
      ) : selected?.kind === "result" ? (
        <div className="tb-map-card" role="dialog" aria-label="검색한 위치" data-testid="map-card">
          <div className="flex items-start gap-2">
            <span className="tb-map-row-icon mt-0.5" aria-hidden="true">
              📍
            </span>
            <div className="min-w-0 flex-1">
              <div className="line-clamp-2 text-[15px] font-semibold">{shortPlaceName(selected.result.label)}</div>
              <div className="line-clamp-2 text-xs text-[var(--text-muted)]">{selected.result.label}</div>
              <div className="mt-0.5 text-[11px] text-[var(--text-faint)]">
                {formatCoordinates(selected.result.lat, selected.result.lng)} · {selected.result.source}
              </div>
            </div>
            <button type="button" className="tb-iconbtn h-7 w-7 shrink-0" aria-label="닫기" onClick={() => setSelected(null)}>
              ×
            </button>
          </div>
          <div className="mt-2.5 flex flex-wrap gap-1.5">
            <button
              type="button"
              className="tb-btn tb-btn-primary !px-3 !py-1 text-xs"
              onClick={() =>
                startNewPlace(selected.result.lat, selected.result.lng, {
                  name: shortPlaceName(selected.result.label),
                  address: selected.result.label.slice(0, 200),
                  kind: "site",
                })
              }
            >
              장소로 저장
            </button>
            {canCreateItems ? (
              <button
                type="button"
                className="tb-btn !px-3 !py-1 text-xs"
                onClick={() => startNewItem(selected.result.lat, selected.result.lng, shortPlaceName(selected.result.label))}
              >
                여기에 업무 추가
              </button>
            ) : null}
            <DirectionLinks
              name={shortPlaceName(selected.result.label)}
              lat={selected.result.lat}
              lng={selected.result.lng}
              onCopy={copyCoordinates}
            />
          </div>
        </div>
      ) : null}

      {toast ? (
        <div className="tb-map-toast" role="status">
          <span className="min-w-0 flex-1">{toast.text}</span>
          {toast.undo ? (
            <button
              type="button"
              className="font-semibold text-[#9be3d4] hover:underline"
              onClick={() => {
                toast.undo?.();
                setToast(null);
              }}
            >
              되돌리기
            </button>
          ) : null}
        </div>
      ) : null}

      <div className="tb-map-coords" aria-hidden="true" hidden={Boolean(selected)}>
        <span ref={coordsRef} />
      </div>

      {placeDraft ? (
        <PlaceEditor
          draft={placeDraft}
          editable={placeDraft.id === null || canEditPlace({ createdByMemberId: placeDraft.createdByMemberId ?? -1 })}
          saving={savingPlace}
          error={placeError}
          customKinds={[...new Set(places.map((place) => place.customKind).filter(Boolean))]}
          onChange={setPlaceDraft}
          onSave={() => void savePlace()}
          onDelete={() => {
            const place = places.find((entry) => entry.id === placeDraft.id);
            if (place) {
              void deletePlace(place);
            }
          }}
          onRepick={() => {
            setMode({ kind: "repick", draft: placeDraft });
            setPlaceDraft(null);
          }}
          onClose={() => setPlaceDraft(null)}
        />
      ) : null}

      <input
        ref={shpInputRef}
        type="file"
        multiple
        accept=".zip,.shp,.dbf,.prj,.cpg"
        className="hidden"
        data-testid="shp-input"
        onChange={(event) => {
          const files = [...(event.target.files ?? [])];
          event.target.value = "";
          if (files.length) {
            cancelAll();
            setShpError("");
            setShpFiles(files);
          }
        }}
      />
      {shpFiles ? (
        <ShpImportDialog
          files={shpFiles}
          saving={savingShp}
          error={shpError}
          onPreview={previewShp}
          onImport={(imported) => void importShp(imported)}
          onClose={closeShp}
        />
      ) : null}
      {areaDraft ? (
        <AreaEditor
          draft={areaDraft}
          editable={areaDraft.id === null || canEditArea({ createdByMemberId: areaDraft.createdByMemberId ?? -1 })}
          saving={savingArea}
          error={areaError}
          onChange={setAreaDraft}
          onSave={() => void saveArea()}
          onDelete={() => {
            const area = areas.find((entry) => entry.id === areaDraft.id);
            if (area) {
              void deleteArea(area);
            }
          }}
          onClose={() => setAreaDraft(null)}
        />
      ) : null}
    </div>
  );
}

function DirectionLinks({
  name,
  lat,
  lng,
  onCopy,
}: {
  name: string;
  lat: number;
  lng: number;
  onCopy: (lat: number, lng: number) => void;
}) {
  const links = directionLinks(name, lat, lng);
  return (
    <>
      <a className="tb-btn !px-3 !py-1 text-xs" href={links.kakao} target="_blank" rel="noreferrer" title="카카오맵에서 길찾기">
        길찾기
      </a>
      <a className="tb-btn !px-3 !py-1 text-xs" href={links.google} target="_blank" rel="noreferrer" title="구글 지도에서 길찾기">
        구글 지도
      </a>
      <button type="button" className="tb-btn !px-3 !py-1 text-xs" onClick={() => onCopy(lat, lng)}>
        좌표 복사
      </button>
    </>
  );
}

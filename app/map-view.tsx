"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type * as LeafletNS from "leaflet";
import "leaflet/dist/leaflet.css";

import { escapeHtml } from "./lib/board-config";
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
import { PlaceEditor, draftFromPlace, newPlaceDraft, placePinHtml, type PlaceDraft } from "./map-places";

// 지도: the board map, built like the everyday map apps.
// - 더블클릭 · 우클릭 · 길게 누르기 → "여기에 장소 / 업무 추가, 좌표 복사" menu
// - Search box on the map: this board's 업무·장소 first, then place names
// - Left panel (bottom sheet on phones): 업무 · 장소 · 위치 미지정
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
  | { kind: "result"; result: MapSearchResult };

type Mode = null | { kind: "assign"; itemId: number } | { kind: "new-place" } | { kind: "new-item" } | { kind: "repick"; draft: PlaceDraft };

/** Where the "add here" menu opens; flipX/flipY keep it inside the map. */
type Menu = { lat: number; lng: number; x: number; y: number; flipX: boolean; flipY: boolean };
type Tab = "items" | "places" | "unplaced";
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
  const tempLayerRef = useRef<LeafletNS.LayerGroup | null>(null);
  const markersRef = useRef<Map<string, LeafletNS.Marker>>(new Map());
  const fittedRef = useRef(false);
  const handlersRef = useRef<{
    pick: (lat: number, lng: number, x: number, y: number) => void;
    click: (lat: number, lng: number) => void;
    closeMenu: () => void;
  }>({ pick: () => {}, click: () => {}, closeMenu: () => {} });

  const [ready, setReady] = useState(0);
  const [selected, setSelected] = useState<Selection | null>(null);
  const [menu, setMenu] = useState<Menu | null>(null);
  const [mode, setMode] = useState<Mode>(null);
  const [tab, setTab] = useState<Tab>("items");
  const [panelOpen, setPanelOpen] = useState(
    () => typeof window === "undefined" || window.matchMedia("(min-width: 1024px)").matches
  );
  const [showItems, setShowItems] = useState(true);
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

  const pinned = useMemo(() => items.filter(located), [items]);
  const unplaced = useMemo(() => items.filter((item) => !located(item)), [items]);
  const kinds = useMemo(() => placeKindsInUse(places), [places]);
  const visiblePlaces = useMemo(
    () => places.filter((place) => !hiddenKinds.has(placeKindOf(place).label)),
    [hiddenKinds, places]
  );
  const canEditPlace = (place: Pick<MapPlace, "createdByMemberId">) =>
    isManager || (me !== null && place.createdByMemberId === me.memberId);

  function say(text: string, undo?: () => void) {
    setToast({ id: Date.now(), text, undo });
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
      ...(showItems ? pinned.map((item) => [item.lat, item.lng] as [number, number]) : []),
      ...(showPlaces ? visiblePlaces.map((place) => [place.lat, place.lng] as [number, number]) : []),
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
      closeMenu: () => setMenu(null),
    };
  });

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !placeDraft) {
        cancelAll();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [placeDraft]);

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
      for (const item of pinned) {
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
  }, [pinned, visiblePlaces, showItems, showPlaces, selected, ready, isManager, me]);

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
      }
    : { items: [], places: [] };

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
        {pinned.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => chooseItem(item)}
            onMouseEnter={() => highlight(`item:${item.id}`, true)}
            onMouseLeave={() => highlight(`item:${item.id}`, false)}
            data-active={selected?.kind === "item" && selected.id === item.id}
            className="tb-map-row"
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
        ))}
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
    <div className="tb-card tb-map-app relative overflow-hidden" data-testid="map-view">
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
                {localMatches.items.length || localMatches.places.length ? (
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
                      ["unplaced", `위치 미지정 ${unplaced.length}`],
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

      {modeText ? (
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

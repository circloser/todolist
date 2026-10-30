"use client";

import { useEffect } from "react";
import "leaflet/dist/leaflet.css";

import {
  itemProgress,
} from "../../lib/workflow";
import {
  COMPLETE_COLOR,
  MAP_PROVIDER_LABELS,
  MAP_STYLE_LABELS,
} from "../board-utils";
import { useBoard } from "../board-context";

export default function MapView() {
  const {
    items,
    mapContainerRef,
    setMapContainerMounted,
    leafletMapRef,
    placingItemId,
    setPlacingItemId,
    creatingOnMap,
    setCreatingOnMap,
    setMapNewLocation,
    mapProvider,
    mapStyle,
    mapSearchQuery,
    setMapSearchQuery,
    mapSearchResults,
    mapSearching,
    mapSearchError,
    setMapSettingsOpen,
    savingItemIds,
    visibleItems,
    clearMapPin,
    searchMapPlaces,
    openItem,
  } = useBoard();

  useEffect(() => {
    setMapContainerMounted(true);
    return () => setMapContainerMounted(false);
  }, [setMapContainerMounted]);

  return (
    <div className="grid items-stretch gap-4 lg:grid-cols-[minmax(0,1fr)_300px]">
      <div className="tb-card tb-map-shell min-h-[560px] overflow-hidden lg:min-h-[calc(100dvh-220px)]">
        {placingItemId !== null || creatingOnMap ? (
          <div className="flex items-center justify-between gap-3 border-b border-[var(--warning-border)] bg-[var(--warning-soft)] px-4 py-2 text-sm font-medium text-[var(--warning)]">
            <span>
              {placingItemId !== null ? (
                <>
                  🖱 지도를 클릭해{" "}
                  <strong>
                    {items.find((item) => item.id === placingItemId)
                      ?.title ?? "업무"}
                  </strong>
                  의 위치를 지정하세요
                </>
              ) : (
                <>🖱 지도를 클릭해 새 업무의 위치를 선택하세요</>
              )}
            </span>
            <button
              type="button"
              onClick={() => {
                setPlacingItemId(null);
                setCreatingOnMap(false);
              }}
              className="tb-btn shrink-0 !py-1 text-xs"
            >
              취소
            </button>
          </div>
        ) : null}
        <div
          ref={mapContainerRef}
          className="tb-map-canvas h-full min-h-[560px] w-full lg:min-h-[calc(100dvh-220px)]"
        />
      </div>

      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => {
              setPlacingItemId(null);
              setCreatingOnMap(true);
            }}
            disabled={creatingOnMap}
            className="tb-btn tb-btn-primary justify-center"
          >
            + 새 업무
          </button>
          <button
            type="button"
            onClick={() => setMapSettingsOpen(true)}
            className="tb-btn justify-center"
          >
            지도 설정
          </button>
        </div>
        <div className="text-center text-[11px] text-[var(--text-faint)]">
          {MAP_PROVIDER_LABELS[mapProvider]} · {MAP_STYLE_LABELS[mapStyle]}
        </div>

        <div className="tb-card p-4">
          <h2 className="text-sm font-semibold">지명 검색</h2>
          <form
            onSubmit={(event) => void searchMapPlaces(event)}
            className="mt-3 flex gap-2"
          >
            <input
              value={mapSearchQuery}
              onChange={(event) => setMapSearchQuery(event.target.value)}
              className="tb-field min-w-0 flex-1"
              placeholder="예: 우포늪, 순천만"
            />
            <button
              type="submit"
              disabled={!mapSearchQuery.trim() || mapSearching}
              className="tb-btn tb-btn-primary shrink-0 !px-3"
            >
              {mapSearching ? "검색 중" : "검색"}
            </button>
          </form>
          {mapSearchError ? (
            <p className="mt-2 text-[11px] text-[var(--danger)]">
              {mapSearchError}
            </p>
          ) : null}
          {mapSearchResults.length ? (
            <div className="mt-2 max-h-40 space-y-1 overflow-auto">
              {mapSearchResults.map((result) => (
                <button
                  key={`${result.source}-${result.lat}-${result.lng}-${result.label}`}
                  type="button"
                  onClick={() => {
                    leafletMapRef.current?.setView(
                      [result.lat, result.lng],
                      13
                    );
                    setMapNewLocation(result.label);
                  }}
                  className="w-full rounded-[var(--radius-sm)] px-2 py-1.5 text-left text-xs transition hover:bg-[var(--surface-3)]"
                >
                  <div className="line-clamp-2 font-medium">
                    {result.label}
                  </div>
                  <div className="text-[11px] text-[var(--text-faint)]">
                    {result.source} · {result.lat.toFixed(4)},{" "}
                    {result.lng.toFixed(4)}
                  </div>
                </button>
              ))}
            </div>
          ) : null}
        </div>

        <div className="tb-card p-4">
          <h2 className="text-sm font-semibold">범례</h2>
          <div className="mt-2.5 space-y-1.5 text-sm">
            {[
              { color: "#18786f", label: "진행 중" },
              { color: "#d97706", label: "마감 임박 (D-3 이내)" },
              { color: "#dc2626", label: "지연" },
              { color: COMPLETE_COLOR, label: "완료" },
            ].map((entry) => (
              <div key={entry.label} className="flex items-center gap-2">
                <span
                  className="h-3 w-3 rounded-full border-2 border-white shadow"
                  style={{ background: entry.color }}
                />
                <span className="text-[var(--text-muted)]">
                  {entry.label}
                </span>
              </div>
            ))}
          </div>
        </div>

        <div className="tb-card p-4">
          <h2 className="text-sm font-semibold">
            지도 표시 업무{" "}
            <span className="text-[var(--text-faint)]">
              {
                visibleItems.filter(
                  (item) => item.lat !== null && item.lng !== null
                ).length
              }
            </span>
          </h2>
          <div className="mt-2 max-h-[26vh] space-y-1 overflow-auto">
            {visibleItems
              .filter((item) => item.lat !== null && item.lng !== null)
              .map((item) => (
                <div key={item.id} className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() =>
                      leafletMapRef.current?.setView(
                        [item.lat as number, item.lng as number],
                        11
                      )
                    }
                    className="min-w-0 flex-1 rounded-[var(--radius-sm)] px-2 py-1.5 text-left text-sm transition hover:bg-[var(--surface-3)]"
                  >
                    <div className="truncate font-medium">
                      {item.title || "제목 없음"}
                    </div>
                    <div className="truncate text-[11px] text-[var(--text-faint)]">
                      📍 {item.location || "이름 없는 위치"} ·{" "}
                      {itemProgress(item)}%
                    </div>
                  </button>
                  <button
                    type="button"
                    onClick={() => setPlacingItemId(item.id)}
                    className="tb-iconbtn h-7 w-7 shrink-0 text-xs"
                    title="지도를 클릭해 위치 다시 지정"
                  >
                    📍
                  </button>
                  <button
                    aria-label="지도 핀 삭제"
                    type="button"
                    disabled={savingItemIds.has(item.id)}
                    onClick={() => void clearMapPin(item)}
                    className="tb-iconbtn tb-iconbtn-danger h-7 w-7 shrink-0 text-xs disabled:cursor-not-allowed disabled:opacity-40"
                    title="지도 핀 삭제"
                  >
                    ×
                  </button>
                </div>
              ))}
            {!visibleItems.some(
              (item) => item.lat !== null && item.lng !== null
            ) ? (
              <div className="py-4 text-sm text-[var(--text-faint)]">
                좌표가 지정된 업무가 없습니다.
              </div>
            ) : null}
          </div>
        </div>

        <div className="tb-card p-4">
          <h2 className="text-sm font-semibold">
            위치 미지정{" "}
            <span className="text-[var(--text-faint)]">
              {
                visibleItems.filter(
                  (item) => item.lat === null || item.lng === null
                ).length
              }
            </span>
          </h2>
          <div className="mt-2 max-h-[22vh] space-y-1 overflow-auto">
            {visibleItems
              .filter((item) => item.lat === null || item.lng === null)
              .map((item) => (
                <div key={item.id} className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => openItem(item.id)}
                    className="min-w-0 flex-1 truncate rounded-[var(--radius-sm)] px-2 py-1.5 text-left text-sm transition hover:bg-[var(--surface-3)]"
                    title="클릭해 상세에서 위치를 지정하세요"
                  >
                    {item.title || "제목 없음"}
                  </button>
                  <button
                    type="button"
                    onClick={() => setPlacingItemId(item.id)}
                    className="tb-iconbtn h-7 w-7 shrink-0 text-xs"
                    title="지도를 클릭해 위치 지정"
                  >
                    📍
                  </button>
                </div>
              ))}
          </div>
          <p className="mt-2 text-[11px] leading-4 text-[var(--text-faint)]">
            📍 버튼을 누른 뒤 지도를 클릭하면 그 지점이 위치로 저장됩니다.
            이름은 상세 패널의 &lsquo;위치&rsquo;에서 지정할 수 있습니다.
          </p>
        </div>
      </div>
    </div>
  );
}

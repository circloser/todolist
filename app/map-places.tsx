"use client";

import { useEffect } from "react";

import { PLACE_KINDS, placeKindOf, type MapPlace, type PlaceKind } from "./lib/places";

// 지도 장소 UI helpers: the editor dialog, drafts and the pin markup. The
// map itself (layers, panel, info card) lives in map-view.tsx.

export type PlaceDraft = {
  id: number | null;
  name: string;
  kind: PlaceKind;
  customKind: string;
  lat: number;
  lng: number;
  address: string;
  memo: string;
  createdByMemberId: number | null;
  createdByName: string;
};

export function newPlaceDraft(lat: number, lng: number, overrides: Partial<PlaceDraft> = {}): PlaceDraft {
  return {
    id: null,
    name: "",
    kind: "office",
    customKind: "",
    lat,
    lng,
    address: "",
    memo: "",
    createdByMemberId: null,
    createdByName: "",
    ...overrides,
  };
}

export function draftFromPlace(place: MapPlace): PlaceDraft {
  return {
    id: place.id,
    name: place.name,
    kind: place.kind,
    customKind: place.customKind,
    lat: place.lat,
    lng: place.lng,
    address: place.address,
    memo: place.memo,
    createdByMemberId: place.createdByMemberId,
    createdByName: place.createdByName,
  };
}

/** Marker HTML for Leaflet (escaped by the caller where text is involved). */
export function placePinHtml(place: Pick<MapPlace, "kind" | "customKind">) {
  const kind = placeKindOf(place);
  return `<span style="--place-color:${kind.color}"><i>${kind.icon}</i></span>`;
}

export function PlaceEditor({
  draft,
  editable,
  saving,
  error,
  customKinds,
  onChange,
  onSave,
  onDelete,
  onRepick,
  onClose,
}: {
  draft: PlaceDraft;
  editable: boolean;
  saving: boolean;
  error: string;
  customKinds: string[];
  onChange: (draft: PlaceDraft) => void;
  onSave: () => void;
  onDelete: () => void;
  onRepick: () => void;
  onClose: () => void;
}) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-auto bg-black/40 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="place-editor-title"
        className="tb-card my-8 w-full max-w-[480px] !bg-[var(--surface)] shadow-[var(--shadow-lg)]"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-[var(--border)] px-5 py-3.5">
          <h2 id="place-editor-title" className="text-base font-semibold">
            {draft.id ? (editable ? "장소 수정" : "장소 보기") : "새 장소"}
          </h2>
          <button type="button" onClick={onClose} className="tb-iconbtn h-8 w-8" aria-label="닫기">
            ×
          </button>
        </div>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            onSave();
          }}
        >
          <fieldset disabled={!editable || saving} className="space-y-3 px-5 py-4">
            <label className="block">
              <span className="tb-label">이름</span>
              <input
                autoFocus
                className="tb-field"
                value={draft.name}
                maxLength={80}
                placeholder="예: 습지복원팀 사무실, 우포늪 생태관"
                onChange={(event) => onChange({ ...draft, name: event.target.value })}
              />
            </label>
            <div>
              <div className="tb-label">유형</div>
              <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="장소 유형">
                {PLACE_KINDS.map((kind) => (
                  <button
                    key={kind.key}
                    type="button"
                    role="radio"
                    aria-checked={draft.kind === kind.key}
                    onClick={() => onChange({ ...draft, kind: kind.key })}
                    className="rounded-full border px-2.5 py-1 text-xs font-semibold"
                    style={
                      draft.kind === kind.key
                        ? { background: kind.color, color: "#fff", borderColor: kind.color }
                        : { color: kind.color, borderColor: "var(--border)" }
                    }
                  >
                    {kind.icon} {kind.label}
                  </button>
                ))}
              </div>
              {draft.kind === "etc" ? (
                <>
                  <input
                    className="tb-field mt-2"
                    value={draft.customKind}
                    maxLength={20}
                    list="place-custom-kinds"
                    placeholder="유형 이름 (예: 숙소, 장비 보관소) — 비우면 ‘기타’"
                    aria-label="유형 이름"
                    onChange={(event) => onChange({ ...draft, customKind: event.target.value })}
                  />
                  <datalist id="place-custom-kinds">
                    {customKinds.map((name) => (
                      <option key={name} value={name} />
                    ))}
                  </datalist>
                </>
              ) : null}
            </div>
            <label className="block">
              <span className="tb-label">주소·위치 설명</span>
              <input
                className="tb-field"
                value={draft.address}
                maxLength={200}
                placeholder="예: 경남 창녕군 유어면 우포늪길 220"
                onChange={(event) => onChange({ ...draft, address: event.target.value })}
              />
            </label>
            <label className="block">
              <span className="tb-label">메모</span>
              <textarea
                className="tb-field min-h-[64px]"
                value={draft.memo}
                maxLength={1000}
                placeholder="연락처, 출입 방법, 주차 안내 등"
                onChange={(event) => onChange({ ...draft, memo: event.target.value })}
              />
            </label>
          </fieldset>
          <div className="flex flex-wrap items-center gap-2 px-5 pb-2 text-xs text-[var(--text-muted)]">
            <span>
              📍 {draft.lat.toFixed(5)}, {draft.lng.toFixed(5)}
            </span>
            {editable ? (
              <button type="button" onClick={onRepick} className="font-semibold text-[var(--accent)] hover:underline">
                지도에서 다시 지정
              </button>
            ) : null}
            {draft.id ? (
              <span className="ml-auto text-[var(--text-faint)]">
                등록: {draft.createdByName}
                {!editable ? " · 등록한 사람 또는 부서장만 수정할 수 있습니다" : ""}
              </span>
            ) : null}
          </div>
          {error ? (
            <div role="alert" className="mx-5 mb-2 rounded-[var(--radius)] bg-[var(--danger-soft)] px-3 py-2 text-sm text-[var(--danger)]">
              {error}
            </div>
          ) : null}
          <div className="flex items-center gap-2 border-t border-[var(--border)] px-5 py-3">
            {editable ? (
              <button type="submit" className="tb-btn tb-btn-primary" disabled={saving}>
                {saving ? "저장 중…" : "저장"}
              </button>
            ) : null}
            {draft.id && editable ? (
              <button type="button" onClick={onDelete} disabled={saving} className="tb-btn ml-auto text-[var(--danger)]">
                삭제
              </button>
            ) : null}
            <button type="button" onClick={onClose} className={`tb-btn ${draft.id && editable ? "" : "ml-auto"}`}>
              닫기
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

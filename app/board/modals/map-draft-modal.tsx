"use client";

import { useBoard } from "../board-context";

export default function MapDraftModal() {
  const {
    templates,
    mapDraft,
    setMapDraft,
    mapNewTitle,
    setMapNewTitle,
    mapNewAssignee,
    setMapNewAssignee,
    mapNewLocation,
    setMapNewLocation,
    newTemplateKey,
    setNewTemplateKey,
    newGroup,
    setNewGroup,
    adding,
    templatesByKey,
    createItemOnMap,
    openTemplateEditor,
  } = useBoard();

  if (!mapDraft) {
    return null;
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-auto bg-black/40 p-4 backdrop-blur-sm"
      onClick={() => setMapDraft(null)}
    >
      <div
        className="tb-card my-10 w-full max-w-[420px] shadow-[var(--shadow-lg)]"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-[var(--border)] px-5 py-3.5">
          <h2 className="text-base font-semibold">지도에서 새 업무</h2>
          <button
            aria-label="닫기"
            type="button"
            onClick={() => setMapDraft(null)}
            className="tb-iconbtn h-8 w-8"
          >
            ×
          </button>
        </div>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            void createItemOnMap();
          }}
          className="space-y-3 p-5"
        >
          <div className="text-xs text-[var(--text-faint)]">
            선택한 좌표 {mapDraft.lat.toFixed(4)}, {mapDraft.lng.toFixed(4)}
          </div>
          <label className="block">
            <span className="tb-label">업무명 *</span>
            <input
              value={mapNewTitle}
              onChange={(event) => setMapNewTitle(event.target.value)}
              className="tb-field"
              placeholder="새 업무명"
              autoFocus
            />
          </label>
          <label className="block">
            <span className="tb-label">유형 (단계 세트)</span>
            <select
              value={newTemplateKey}
              onChange={(event) => {
                if (event.target.value === "__new__") {
                  setMapDraft(null);
                  openTemplateEditor(null);
                  return;
                }
                setNewTemplateKey(event.target.value);
              }}
              className="tb-field"
            >
              {templates.map((template) => (
                <option key={template.key} value={template.key}>
                  {template.name} ({template.stages.length}단계)
                </option>
              ))}
              <option value="__new__">＋ 새 유형 만들기…</option>
            </select>
            <span className="mt-1 block text-[11px] text-[var(--text-faint)]">
              {templatesByKey.get(newTemplateKey)?.stages.length ?? 0}개
              단계가 진행 체크리스트로 생성됩니다
            </span>
          </label>
          <div className="grid grid-cols-2 gap-2">
            <label className="block">
              <span className="tb-label">업무 위계</span>
              <input
                list="group-list"
                value={newGroup}
                onChange={(event) => setNewGroup(event.target.value)}
                className="tb-field"
                placeholder="예: 복원사업 > 현장조사"
              />
            </label>
            <label className="block">
              <span className="tb-label">담당자</span>
              <input
                value={mapNewAssignee}
                onChange={(event) => setMapNewAssignee(event.target.value)}
                className="tb-field"
                placeholder="담당자"
              />
            </label>
            <label className="block">
              <span className="tb-label">위치명</span>
              <input
                list="wetland-presets"
                value={mapNewLocation}
                onChange={(event) => setMapNewLocation(event.target.value)}
                className="tb-field"
                placeholder="예: 우포늪"
              />
            </label>
          </div>
          <div className="flex gap-2 pt-1">
            <button
              type="submit"
              disabled={!mapNewTitle.trim() || adding}
              className="tb-btn tb-btn-primary flex-1"
            >
              {adding ? "추가 중…" : "이 위치에 추가"}
            </button>
            <button
              type="button"
              onClick={() => setMapDraft(null)}
              className="tb-btn"
            >
              취소
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

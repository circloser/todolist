"use client";

import { useBoard } from "../board-context";

export default function TemplateEditorModal() {
  const {
    templates,
    setTemplateEditorOpen,
    templateDraft,
    setTemplateDraft,
    savingTemplate,
    openTemplateEditor,
    saveTemplateDraft,
    deleteTemplateByKey,
  } = useBoard();

  if (!templateDraft) {
    return null;
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-auto bg-black/40 p-4 backdrop-blur-sm"
      onClick={() => {
        setTemplateEditorOpen(false);
        setTemplateDraft(null);
      }}
    >
      <div
        className="tb-card my-6 w-full max-w-[760px] shadow-[var(--shadow-lg)]"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-[var(--border)] px-5 py-3.5">
          <h2 className="text-base font-semibold">유형·단계 관리</h2>
          <button
            aria-label="닫기"
            type="button"
            onClick={() => {
              setTemplateEditorOpen(false);
              setTemplateDraft(null);
            }}
            className="tb-iconbtn h-8 w-8"
          >
            ×
          </button>
        </div>

        <div className="grid gap-4 p-5 md:grid-cols-[200px_1fr]">
          <div className="space-y-1.5">
            <div className="tb-label">유형 목록</div>
            {templates.map((template) => (
              <button
                key={template.key}
                type="button"
                onClick={() => openTemplateEditor(template)}
                data-active={templateDraft.key === template.key}
                className={`flex w-full items-center justify-between rounded-[var(--radius)] border px-3 py-2 text-left text-sm transition ${
                  templateDraft.key === template.key
                    ? "border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--accent)]"
                    : "border-[var(--border)] bg-[var(--surface)] hover:bg-[var(--surface-3)]"
                }`}
              >
                <span className="truncate">{template.name}</span>
                <span className="text-[var(--text-faint)]">
                  {template.stages.length}
                </span>
              </button>
            ))}
            <button
              type="button"
              onClick={() => openTemplateEditor(null)}
              className="tb-btn w-full"
            >
              + 새 유형
            </button>
          </div>

          <div className="space-y-3">
            <label className="block">
              <span className="tb-label">유형 이름</span>
              <input
                value={templateDraft.name}
                onChange={(event) =>
                  setTemplateDraft((draft) =>
                    draft ? { ...draft, name: event.target.value } : draft
                  )
                }
                className="tb-field"
                placeholder="예: 외부 용역, 현장 조사"
              />
            </label>

            <div>
              <div className="mb-1.5 flex items-center justify-between">
                <span className="tb-label !mb-0">진행 단계</span>
                <span className="text-xs text-[var(--text-faint)]">
                  {templateDraft.stages.length}단계
                </span>
              </div>
              <div className="max-h-[46vh] space-y-1.5 overflow-auto pr-1">
                {templateDraft.stages.map((stage, index) => (
                  <div
                    key={index}
                    className="flex items-center gap-1.5 rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface-2)] p-1.5"
                  >
                    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[var(--accent-soft)] text-[11px] font-bold text-[var(--accent)]">
                      {index + 1}
                    </span>
                    <input
                      value={stage.title}
                      onChange={(event) =>
                        setTemplateDraft((draft) =>
                          draft
                            ? {
                                ...draft,
                                stages: draft.stages.map((current, i) =>
                                  i === index
                                    ? { ...current, title: event.target.value }
                                    : current
                                ),
                              }
                            : draft
                        )
                      }
                      className="tb-field flex-1"
                      placeholder="단계 이름"
                    />
                    <input
                      value={stage.group}
                      onChange={(event) =>
                        setTemplateDraft((draft) =>
                          draft
                            ? {
                                ...draft,
                                stages: draft.stages.map((current, i) =>
                                  i === index
                                    ? { ...current, group: event.target.value }
                                    : current
                                ),
                              }
                            : draft
                        )
                      }
                      className="tb-field hidden w-28 sm:block"
                      placeholder="그룹(선택)"
                    />
                    <div className="flex shrink-0 flex-col">
                      <button
                        type="button"
                        disabled={index === 0}
                        onClick={() =>
                          setTemplateDraft((draft) => {
                            if (!draft || index === 0) return draft;
                            const stages = [...draft.stages];
                            [stages[index - 1], stages[index]] = [
                              stages[index],
                              stages[index - 1],
                            ];
                            return { ...draft, stages };
                          })
                        }
                        className="tb-iconbtn h-4 w-6 disabled:opacity-30"
                        title="위로"
                      >
                        ▲
                      </button>
                      <button
                        type="button"
                        disabled={index === templateDraft.stages.length - 1}
                        onClick={() =>
                          setTemplateDraft((draft) => {
                            if (!draft || index === draft.stages.length - 1)
                              return draft;
                            const stages = [...draft.stages];
                            [stages[index], stages[index + 1]] = [
                              stages[index + 1],
                              stages[index],
                            ];
                            return { ...draft, stages };
                          })
                        }
                        className="tb-iconbtn h-4 w-6 disabled:opacity-30"
                        title="아래로"
                      >
                        ▼
                      </button>
                    </div>
                    <button
                      aria-label="단계 삭제"
                      type="button"
                      onClick={() =>
                        setTemplateDraft((draft) =>
                          draft
                            ? {
                                ...draft,
                                stages: draft.stages.filter(
                                  (_, i) => i !== index
                                ),
                              }
                            : draft
                        )
                      }
                      className="tb-iconbtn tb-iconbtn-danger h-7 w-7 shrink-0"
                      title="단계 삭제"
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>
              <button
                type="button"
                onClick={() =>
                  setTemplateDraft((draft) =>
                    draft
                      ? {
                          ...draft,
                          stages: [
                            ...draft.stages,
                            { stageKey: null, title: "", group: "" },
                          ],
                        }
                      : draft
                  )
                }
                className="tb-btn mt-1.5 w-full"
              >
                + 단계 추가
              </button>
            </div>

            <div className="flex items-center gap-2 border-t border-[var(--border)] pt-3">
              <button
                type="button"
                disabled={savingTemplate}
                onClick={() => void saveTemplateDraft()}
                className="tb-btn tb-btn-primary"
              >
                {savingTemplate ? "저장 중…" : "저장"}
              </button>
              {templateDraft.key ? (
                <button
                  type="button"
                  disabled={savingTemplate}
                  onClick={() =>
                    void deleteTemplateByKey(
                      templateDraft.key as string,
                      templateDraft.name
                    )
                  }
                  className="tb-btn tb-iconbtn-danger"
                >
                  유형 삭제
                </button>
              ) : null}
              <button
                type="button"
                onClick={() => {
                  setTemplateEditorOpen(false);
                  setTemplateDraft(null);
                }}
                className="tb-btn ml-auto"
              >
                닫기
              </button>
            </div>
            <p className="text-xs text-[var(--text-faint)]">
              단계를 수정하면 이 유형을 쓰는 기존 업무에도 반영됩니다. (완료
              상태·기한은 유지)
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

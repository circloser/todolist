import { getD1 } from "../../../db";

type StepStatus = "todo" | "done";

type WorkflowItemRow = {
  id: number;
  title: string;
  assignee: string;
  memo: string;
  position: number;
  updated_by: string;
  updated_at: string;
  created_at: string;
};

type WorkflowStepRow = {
  id: number;
  item_id: number;
  stage_key: string;
  title: string;
  description: string;
  phase_group: string;
  position: number;
  progress_value: number | null;
  status: StepStatus;
  completed_at: string | null;
  updated_by: string;
  updated_at: string;
  created_at: string;
};

type LegacyWorkflowTaskRow = {
  template_key: string;
  status: StepStatus;
  completed_at: string | null;
};

const defaultStages = [
  {
    key: "plan-draft",
    title: "계획(초안)",
    description: "초기 범위, 일정, 담당자를 정리합니다.",
    group: "준비",
    progress: null,
  },
  {
    key: "estimate",
    title: "견적",
    description: "예산과 산출 근거를 확인합니다.",
    group: "준비",
    progress: null,
  },
  {
    key: "plan-approval",
    title: "계획 결재",
    description: "계획안 결재 상태를 공유합니다.",
    group: "준비",
    progress: null,
  },
  {
    key: "purchase-request",
    title: "구매 요청",
    description: "구매 요청 접수와 진행 여부를 기록합니다.",
    group: "구매/계약",
    progress: null,
  },
  {
    key: "contract",
    title: "계약 체결",
    description: "계약 서류와 체결 완료 여부를 확인합니다.",
    group: "구매/계약",
    progress: null,
  },
  {
    key: "kickoff",
    title: "착수",
    description: "착수 보고와 실제 시작일을 맞춥니다.",
    group: "수행",
    progress: null,
  },
  {
    key: "progress-25",
    title: "과업 진행(25%)",
    description: "초기 산출물과 일정 위험을 점검합니다.",
    group: "수행",
    progress: 25,
  },
  {
    key: "progress-50",
    title: "과업 진행(50%)",
    description: "중간 진행률과 보완 사항을 공유합니다.",
    group: "수행",
    progress: 50,
  },
  {
    key: "progress-75",
    title: "과업 진행(75%)",
    description: "마무리 전 남은 이슈를 정리합니다.",
    group: "수행",
    progress: 75,
  },
  {
    key: "progress-100",
    title: "과업 진행(100%)",
    description: "과업 완료 산출물을 확인합니다.",
    group: "수행",
    progress: 100,
  },
  {
    key: "completion-receipt",
    title: "완료계 접수",
    description: "완료계 접수일과 누락 서류를 기록합니다.",
    group: "검수/정산",
    progress: null,
  },
  {
    key: "inspection",
    title: "검수",
    description: "검수 결과와 보완 요청을 남깁니다.",
    group: "검수/정산",
    progress: null,
  },
  {
    key: "payment-request",
    title: "대금 지급 요청",
    description: "지급 요청 상태와 필요 서류를 확인합니다.",
    group: "검수/정산",
    progress: null,
  },
  {
    key: "result-report",
    title: "결과 보고",
    description: "최종 결과 보고 완료 여부를 공유합니다.",
    group: "보고",
    progress: null,
  },
];

function getActor(request: Request) {
  const encodedName = request.headers.get("oai-authenticated-user-full-name");
  const nameEncoding = request.headers.get(
    "oai-authenticated-user-full-name-encoding"
  );

  if (encodedName && nameEncoding === "percent-encoded-utf-8") {
    return decodeURIComponent(encodedName);
  }

  return request.headers.get("oai-authenticated-user-email") ?? "팀";
}

function toRouteErrorMessage(error: unknown) {
  const message = error instanceof Error ? error.message : "Unexpected error";
  const cause =
    error instanceof Error && error.cause instanceof Error
      ? error.cause.message
      : "";
  const combined = `${message}\n${cause}`;

  if (combined.includes("no such table")) {
    return "진행 보드 테이블이 아직 준비되지 않았습니다. 다시 배포해 주세요.";
  }

  return message;
}

function toItem(row: WorkflowItemRow, steps: WorkflowStepRow[]) {
  return {
    id: row.id,
    title: row.title,
    assignee: row.assignee,
    memo: row.memo,
    position: row.position,
    updatedBy: row.updated_by,
    updatedAt: row.updated_at,
    createdAt: row.created_at,
    steps: steps.map((step) => ({
      id: step.id,
      itemId: step.item_id,
      stageKey: step.stage_key,
      title: step.title,
      description: step.description,
      phaseGroup: step.phase_group,
      position: step.position,
      progressValue: step.progress_value,
      status: step.status,
      completedAt: step.completed_at,
      updatedBy: step.updated_by,
      updatedAt: step.updated_at,
      createdAt: step.created_at,
    })),
  };
}

async function ensureSchema() {
  const d1 = getD1();

  await d1.batch([
    d1.prepare(`CREATE TABLE IF NOT EXISTS workflow_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      assignee TEXT NOT NULL DEFAULT '',
      memo TEXT NOT NULL DEFAULT '',
      position INTEGER NOT NULL,
      updated_by TEXT NOT NULL DEFAULT '',
      updated_at TEXT NOT NULL,
      created_at TEXT NOT NULL
    )`),
    d1.prepare(`CREATE TABLE IF NOT EXISTS workflow_steps (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      item_id INTEGER NOT NULL,
      stage_key TEXT NOT NULL,
      title TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      phase_group TEXT NOT NULL DEFAULT '',
      position INTEGER NOT NULL,
      progress_value INTEGER,
      status TEXT NOT NULL DEFAULT 'todo' CHECK(status IN ('todo', 'done')),
      completed_at TEXT,
      updated_by TEXT NOT NULL DEFAULT '',
      updated_at TEXT NOT NULL,
      created_at TEXT NOT NULL,
      UNIQUE(item_id, stage_key)
    )`),
    d1.prepare(
      "CREATE INDEX IF NOT EXISTS workflow_items_assignee_idx ON workflow_items (assignee, position)"
    ),
    d1.prepare(
      "CREATE INDEX IF NOT EXISTS workflow_steps_item_position_idx ON workflow_steps (item_id, position)"
    ),
  ]);
}

async function readLegacyStatuses() {
  try {
    const legacy = await getD1()
      .prepare(
        "SELECT template_key, status, completed_at FROM workflow_tasks ORDER BY position"
      )
      .all<LegacyWorkflowTaskRow>();

    return new Map(
      (legacy.results ?? []).map((task) => [
        task.template_key,
        {
          status: task.status === "done" ? "done" : "todo",
          completedAt: task.completed_at,
        },
      ])
    );
  } catch {
    return new Map<string, { status: StepStatus; completedAt: string | null }>();
  }
}

async function createItemWithDefaultSteps({
  title,
  assignee,
  memo,
  actor,
  position,
  legacyStatuses,
}: {
  title: string;
  assignee: string;
  memo: string;
  actor: string;
  position: number;
  legacyStatuses?: Map<string, { status: StepStatus; completedAt: string | null }>;
}) {
  const d1 = getD1();
  const now = new Date().toISOString();
  const insertResult = await d1
    .prepare(`INSERT INTO workflow_items (
      title,
      assignee,
      memo,
      position,
      updated_by,
      updated_at,
      created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?)`)
    .bind(title, assignee, memo, position, actor, now, now)
    .run();
  const itemId = Number(insertResult.meta.last_row_id);

  await d1.batch(
    defaultStages.map((stage, index) => {
      const legacyStatus = legacyStatuses?.get(stage.key);
      const status = legacyStatus?.status ?? "todo";

      return d1
        .prepare(`INSERT INTO workflow_steps (
          item_id,
          stage_key,
          title,
          description,
          phase_group,
          position,
          progress_value,
          status,
          completed_at,
          updated_by,
          updated_at,
          created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
        .bind(
          itemId,
          stage.key,
          stage.title,
          stage.description,
          stage.group,
          index + 1,
          stage.progress,
          status,
          status === "done" ? legacyStatus?.completedAt ?? now : null,
          actor,
          now,
          now
        );
    })
  );

  return itemId;
}

async function ensureDefaultItem() {
  const d1 = getD1();
  const countResult = await d1
    .prepare("SELECT COUNT(*) AS count FROM workflow_items")
    .first<{ count: number }>();

  if (Number(countResult?.count ?? 0) > 0) {
    return;
  }

  await createItemWithDefaultSteps({
    title: "기본 업무",
    assignee: "미지정",
    memo: "",
    actor: "템플릿",
    position: 1,
    legacyStatuses: await readLegacyStatuses(),
  });
}

async function prepareWorkflow() {
  await ensureSchema();
  await ensureDefaultItem();
}

async function getItems() {
  const d1 = getD1();
  const [itemsResult, stepsResult] = await Promise.all([
    d1
      .prepare(
        "SELECT * FROM workflow_items ORDER BY assignee COLLATE NOCASE, position, id"
      )
      .all<WorkflowItemRow>(),
    d1
      .prepare("SELECT * FROM workflow_steps ORDER BY item_id, position, id")
      .all<WorkflowStepRow>(),
  ]);
  const stepsByItem = new Map<number, WorkflowStepRow[]>();

  for (const step of stepsResult.results ?? []) {
    const current = stepsByItem.get(step.item_id) ?? [];
    current.push(step);
    stepsByItem.set(step.item_id, current);
  }

  return (itemsResult.results ?? []).map((item) =>
    toItem(item, stepsByItem.get(item.id) ?? [])
  );
}

async function getItem(itemId: number) {
  const d1 = getD1();
  const item = await d1
    .prepare("SELECT * FROM workflow_items WHERE id = ?")
    .bind(itemId)
    .first<WorkflowItemRow>();

  if (!item) {
    return null;
  }

  const steps = await d1
    .prepare("SELECT * FROM workflow_steps WHERE item_id = ? ORDER BY position, id")
    .bind(itemId)
    .all<WorkflowStepRow>();

  return toItem(item, steps.results ?? []);
}

export async function GET(request: Request) {
  try {
    await prepareWorkflow();

    return Response.json({
      items: await getItems(),
      stages: defaultStages,
      viewer: getActor(request),
    });
  } catch (error) {
    return Response.json(
      { error: toRouteErrorMessage(error) },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    await prepareWorkflow();

    const payload = (await request.json()) as {
      title?: string;
      assignee?: string;
      memo?: string;
    };
    const title = payload.title?.trim().slice(0, 120) ?? "";
    const assignee = payload.assignee?.trim().slice(0, 80) ?? "";
    const memo = payload.memo?.trim().slice(0, 1000) ?? "";

    if (!title) {
      return Response.json({ error: "업무명을 입력해 주세요." }, { status: 400 });
    }

    const d1 = getD1();
    const last = await d1
      .prepare("SELECT MAX(position) AS position FROM workflow_items")
      .first<{ position: number | null }>();
    const itemId = await createItemWithDefaultSteps({
      title,
      assignee: assignee || "미지정",
      memo,
      actor: getActor(request),
      position: Number(last?.position ?? 0) + 1,
    });
    const item = await getItem(itemId);

    return Response.json({ item }, { status: 201 });
  } catch (error) {
    return Response.json(
      { error: toRouteErrorMessage(error) },
      { status: 500 }
    );
  }
}

export async function PATCH(request: Request) {
  try {
    await prepareWorkflow();

    const payload = (await request.json()) as {
      itemId?: number;
      stepId?: number;
      title?: string;
      assignee?: string;
      memo?: string;
      status?: StepStatus;
    };
    const now = new Date().toISOString();
    const actor = getActor(request);
    const d1 = getD1();

    if (Number.isFinite(Number(payload.stepId))) {
      const stepId = Number(payload.stepId);

      if (payload.status !== "done" && payload.status !== "todo") {
        return Response.json({ error: "단계 상태가 필요합니다." }, { status: 400 });
      }

      const step = await d1
        .prepare("SELECT item_id FROM workflow_steps WHERE id = ?")
        .bind(stepId)
        .first<{ item_id: number }>();

      if (!step) {
        return Response.json({ error: "단계를 찾을 수 없습니다." }, { status: 404 });
      }

      await d1.batch([
        d1
          .prepare(`UPDATE workflow_steps
            SET status = ?,
              completed_at = ?,
              updated_by = ?,
              updated_at = ?
            WHERE id = ?`)
          .bind(
            payload.status,
            payload.status === "done" ? now : null,
            actor,
            now,
            stepId
          ),
        d1
          .prepare(
            "UPDATE workflow_items SET updated_by = ?, updated_at = ? WHERE id = ?"
          )
          .bind(actor, now, step.item_id),
      ]);

      return Response.json({ item: await getItem(step.item_id) });
    }

    if (Number.isFinite(Number(payload.itemId))) {
      const itemId = Number(payload.itemId);
      const existing = await d1
        .prepare("SELECT * FROM workflow_items WHERE id = ?")
        .bind(itemId)
        .first<WorkflowItemRow>();

      if (!existing) {
        return Response.json({ error: "업무를 찾을 수 없습니다." }, { status: 404 });
      }

      const title =
        typeof payload.title === "string"
          ? payload.title.trim().slice(0, 120)
          : existing.title;
      const assignee =
        typeof payload.assignee === "string"
          ? payload.assignee.trim().slice(0, 80) || "미지정"
          : existing.assignee;
      const memo =
        typeof payload.memo === "string"
          ? payload.memo.trim().slice(0, 1000)
          : existing.memo;

      if (!title) {
        return Response.json({ error: "업무명을 입력해 주세요." }, { status: 400 });
      }

      await d1
        .prepare(`UPDATE workflow_items
          SET title = ?,
            assignee = ?,
            memo = ?,
            updated_by = ?,
            updated_at = ?
          WHERE id = ?`)
        .bind(title, assignee, memo, actor, now, itemId)
        .run();

      return Response.json({ item: await getItem(itemId) });
    }

    return Response.json({ error: "변경할 업무가 필요합니다." }, { status: 400 });
  } catch (error) {
    return Response.json(
      { error: toRouteErrorMessage(error) },
      { status: 500 }
    );
  }
}

import { getD1 } from "../../../db";

type StepStatus = "todo" | "done";

type WorkflowItemRow = {
  id: number;
  title: string;
  assignee: string;
  category: string;
  memo: string;
  due_date: string | null;
  template_key: string;
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
  due_date: string | null;
  completed_at: string | null;
  updated_by: string;
  updated_at: string;
  created_at: string;
};

type WorkflowSubtaskRow = {
  id: number;
  item_id: number;
  title: string;
  status: StepStatus;
  due_date: string | null;
  blockers: string;
  position: number;
  updated_by: string;
  updated_at: string;
  created_at: string;
};

type HistoryRow = {
  id: number;
  item_id: number | null;
  entity_type: string;
  entity_id: number | null;
  action: string;
  summary: string;
  actor: string;
  created_at: string;
};

type AssigneeSettingRow = {
  assignee: string;
  color: string;
  updated_at: string;
};

type AppSettingRow = {
  key: string;
  value: string;
  updated_at: string;
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

const templates = [
  {
    key: "general-service",
    name: "일반 용역",
    description: "계획, 구매/계약, 착수, 과업 진행, 검수, 지급, 결과 보고",
  },
  {
    key: "goods-purchase",
    name: "물품 구매",
    description: "견적, 구매 요청, 계약/구매, 검수, 지급 요청 중심",
  },
  {
    key: "internal-research",
    name: "자체 연구",
    description: "계획, 착수, 진행률 점검, 검수, 결과 보고 중심",
  },
];

const defaultAppSettings = {
  organizationName: "습지복원팀",
  boardTitle: "Workflow Command Center",
};

function normalizeActor(value: unknown) {
  if (typeof value !== "string") {
    return "";
  }

  return value.trim().slice(0, 80);
}

function getActor(request: Request, override?: unknown) {
  const overrideName = normalizeActor(override);

  if (overrideName) {
    return overrideName;
  }

  const encodedName = request.headers.get("oai-authenticated-user-full-name");
  const nameEncoding = request.headers.get(
    "oai-authenticated-user-full-name-encoding"
  );

  if (encodedName && nameEncoding === "percent-encoded-utf-8") {
    return decodeURIComponent(encodedName);
  }

  return request.headers.get("oai-authenticated-user-email") ?? "사용자";
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

function normalizeDate(value: unknown) {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();

  if (!trimmed) {
    return null;
  }

  return /^\d{4}-\d{2}-\d{2}$/.test(trimmed) ? trimmed : null;
}

function getTemplate(key?: string) {
  return templates.find((template) => template.key === key) ?? templates[0];
}

function toItem(
  row: WorkflowItemRow,
  steps: WorkflowStepRow[],
  subtasks: WorkflowSubtaskRow[]
) {
  return {
    id: row.id,
    title: row.title,
    assignee: row.assignee,
    category: row.category || "일반 업무",
    memo: row.memo,
    dueDate: row.due_date,
    templateKey: row.template_key,
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
      dueDate: step.due_date,
      completedAt: step.completed_at,
      updatedBy: step.updated_by,
      updatedAt: step.updated_at,
      createdAt: step.created_at,
    })),
    subtasks: subtasks.map((subtask) => ({
      id: subtask.id,
      itemId: subtask.item_id,
      title: subtask.title,
      status: subtask.status,
      dueDate: subtask.due_date,
      blockers: subtask.blockers ?? "",
      position: subtask.position,
      updatedBy: subtask.updated_by,
      updatedAt: subtask.updated_at,
      createdAt: subtask.created_at,
    })),
  };
}

async function addColumnIfMissing(sql: string) {
  try {
    await getD1().prepare(sql).run();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);

    if (!message.includes("duplicate column name")) {
      throw error;
    }
  }
}

async function ensureSchema() {
  const d1 = getD1();

  await d1.batch([
    d1.prepare(`CREATE TABLE IF NOT EXISTS workflow_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      assignee TEXT NOT NULL DEFAULT '',
      category TEXT NOT NULL DEFAULT '일반 업무',
      memo TEXT NOT NULL DEFAULT '',
      due_date TEXT,
      template_key TEXT NOT NULL DEFAULT 'general-service',
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
      due_date TEXT,
      completed_at TEXT,
      updated_by TEXT NOT NULL DEFAULT '',
      updated_at TEXT NOT NULL,
      created_at TEXT NOT NULL,
      UNIQUE(item_id, stage_key)
    )`),
    d1.prepare(`CREATE TABLE IF NOT EXISTS workflow_subtasks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      item_id INTEGER NOT NULL,
      title TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'todo' CHECK(status IN ('todo', 'done')),
      due_date TEXT,
      blockers TEXT NOT NULL DEFAULT '',
      position INTEGER NOT NULL,
      updated_by TEXT NOT NULL DEFAULT '',
      updated_at TEXT NOT NULL,
      created_at TEXT NOT NULL
    )`),
    d1.prepare(`CREATE TABLE IF NOT EXISTS assignee_settings (
      assignee TEXT PRIMARY KEY,
      color TEXT NOT NULL DEFAULT '#e6f4ef',
      updated_at TEXT NOT NULL
    )`),
    d1.prepare(`CREATE TABLE IF NOT EXISTS workflow_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      item_id INTEGER,
      entity_type TEXT NOT NULL,
      entity_id INTEGER,
      action TEXT NOT NULL,
      summary TEXT NOT NULL,
      actor TEXT NOT NULL DEFAULT '팀',
      created_at TEXT NOT NULL
    )`),
    d1.prepare(`CREATE TABLE IF NOT EXISTS app_settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )`),
    d1.prepare(
      "CREATE INDEX IF NOT EXISTS workflow_items_assignee_idx ON workflow_items (assignee, position)"
    ),
    d1.prepare(
      "CREATE INDEX IF NOT EXISTS workflow_steps_item_position_idx ON workflow_steps (item_id, position)"
    ),
    d1.prepare(
      "CREATE INDEX IF NOT EXISTS workflow_subtasks_item_position_idx ON workflow_subtasks (item_id, position)"
    ),
    d1.prepare(
      "CREATE INDEX IF NOT EXISTS workflow_history_created_idx ON workflow_history (created_at)"
    ),
  ]);

  await addColumnIfMissing("ALTER TABLE workflow_items ADD COLUMN due_date TEXT");
  await addColumnIfMissing(
    "ALTER TABLE workflow_items ADD COLUMN category TEXT NOT NULL DEFAULT '일반 업무'"
  );
  await addColumnIfMissing(
    "ALTER TABLE workflow_items ADD COLUMN template_key TEXT NOT NULL DEFAULT 'general-service'"
  );
  await addColumnIfMissing("ALTER TABLE workflow_steps ADD COLUMN due_date TEXT");
  await addColumnIfMissing("ALTER TABLE workflow_subtasks ADD COLUMN due_date TEXT");
  await addColumnIfMissing(
    "ALTER TABLE workflow_subtasks ADD COLUMN blockers TEXT NOT NULL DEFAULT ''"
  );
}

async function logHistory({
  itemId,
  entityType,
  entityId,
  action,
  summary,
  actor,
}: {
  itemId?: number | null;
  entityType: string;
  entityId?: number | null;
  action: string;
  summary: string;
  actor: string;
}) {
  await getD1()
    .prepare(`INSERT INTO workflow_history (
      item_id,
      entity_type,
      entity_id,
      action,
      summary,
      actor,
      created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?)`)
    .bind(
      itemId ?? null,
      entityType,
      entityId ?? null,
      action,
      summary,
      actor,
      new Date().toISOString()
    )
    .run();
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
  category,
  memo,
  dueDate,
  templateKey,
  actor,
  position,
  legacyStatuses,
}: {
  title: string;
  assignee: string;
  category: string;
  memo: string;
  dueDate?: string | null;
  templateKey?: string;
  actor: string;
  position: number;
  legacyStatuses?: Map<string, { status: StepStatus; completedAt: string | null }>;
}) {
  const d1 = getD1();
  const now = new Date().toISOString();
  const selectedTemplate = getTemplate(templateKey);
  const insertResult = await d1
    .prepare(`INSERT INTO workflow_items (
      title,
      assignee,
      category,
      memo,
      due_date,
      template_key,
      position,
      updated_by,
      updated_at,
      created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .bind(
      title,
      assignee,
      category,
      memo,
      dueDate ?? null,
      selectedTemplate.key,
      position,
      actor,
      now,
      now
    )
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
          due_date,
          completed_at,
          updated_by,
          updated_at,
          created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
        .bind(
          itemId,
          stage.key,
          stage.title,
          stage.description,
          stage.group,
          index + 1,
          stage.progress,
          status,
          null,
          status === "done" ? legacyStatus?.completedAt ?? now : null,
          actor,
          now,
          now
        );
    })
  );

  await logHistory({
    itemId,
    entityType: "item",
    entityId: itemId,
    action: "create",
    summary: `${actor}님이 '${title}' 업무를 추가함`,
    actor,
  });

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
    category: "일반 업무",
    memo: "",
    actor: "템플릿",
    position: 1,
    legacyStatuses: await readLegacyStatuses(),
  });
}

async function ensureDefaultSettings() {
  const d1 = getD1();
  const now = new Date().toISOString();
  const assignees = await d1
    .prepare(
      "SELECT DISTINCT assignee FROM workflow_items WHERE assignee IS NOT NULL AND assignee != ''"
    )
    .all<{ assignee: string }>();
  const colors = ["#e6f4ef", "#edf2ff", "#fff4d6", "#fbe7df", "#efe8ff"];

  await d1.batch(
    (assignees.results ?? []).map((row, index) =>
      d1
        .prepare(
          "INSERT OR IGNORE INTO assignee_settings (assignee, color, updated_at) VALUES (?, ?, ?)"
        )
        .bind(row.assignee, colors[index % colors.length], now)
    )
  );

  await d1.batch(
    Object.entries(defaultAppSettings).map(([key, value]) =>
      d1
        .prepare(
          "INSERT OR IGNORE INTO app_settings (key, value, updated_at) VALUES (?, ?, ?)"
        )
        .bind(key, value, now)
    )
  );
}

async function prepareWorkflow() {
  await ensureSchema();
  await ensureDefaultItem();
  await ensureDefaultSettings();
}

async function getItems() {
  const d1 = getD1();
  const [itemsResult, stepsResult, subtasksResult] = await Promise.all([
    d1
      .prepare(
        "SELECT * FROM workflow_items ORDER BY position, id"
      )
      .all<WorkflowItemRow>(),
    d1
      .prepare("SELECT * FROM workflow_steps ORDER BY item_id, position, id")
      .all<WorkflowStepRow>(),
    d1
      .prepare("SELECT * FROM workflow_subtasks ORDER BY item_id, position, id")
      .all<WorkflowSubtaskRow>(),
  ]);
  const stepsByItem = new Map<number, WorkflowStepRow[]>();
  const subtasksByItem = new Map<number, WorkflowSubtaskRow[]>();

  for (const step of stepsResult.results ?? []) {
    const current = stepsByItem.get(step.item_id) ?? [];
    current.push(step);
    stepsByItem.set(step.item_id, current);
  }

  for (const subtask of subtasksResult.results ?? []) {
    const current = subtasksByItem.get(subtask.item_id) ?? [];
    current.push(subtask);
    subtasksByItem.set(subtask.item_id, current);
  }

  return (itemsResult.results ?? []).map((item) =>
    toItem(
      item,
      stepsByItem.get(item.id) ?? [],
      subtasksByItem.get(item.id) ?? []
    )
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

  const [steps, subtasks] = await Promise.all([
    d1
      .prepare("SELECT * FROM workflow_steps WHERE item_id = ? ORDER BY position, id")
      .bind(itemId)
      .all<WorkflowStepRow>(),
    d1
      .prepare("SELECT * FROM workflow_subtasks WHERE item_id = ? ORDER BY position, id")
      .bind(itemId)
      .all<WorkflowSubtaskRow>(),
  ]);

  return toItem(item, steps.results ?? [], subtasks.results ?? []);
}

async function getHistory() {
  const history = await getD1()
    .prepare("SELECT * FROM workflow_history ORDER BY created_at DESC, id DESC LIMIT 80")
    .all<HistoryRow>();

  return (history.results ?? []).map((entry) => ({
    id: entry.id,
    itemId: entry.item_id,
    entityType: entry.entity_type,
    entityId: entry.entity_id,
    action: entry.action,
    summary: entry.summary,
    actor: entry.actor,
    createdAt: entry.created_at,
  }));
}

async function getAssigneeSettings() {
  const settings = await getD1()
    .prepare("SELECT * FROM assignee_settings")
    .all<AssigneeSettingRow>();

  return Object.fromEntries(
    (settings.results ?? []).map((setting) => [
      setting.assignee,
      setting.color,
    ])
  );
}

async function getAppSettings() {
  const settings = await getD1()
    .prepare("SELECT * FROM app_settings")
    .all<AppSettingRow>();

  return {
    ...defaultAppSettings,
    ...Object.fromEntries(
      (settings.results ?? []).map((setting) => [setting.key, setting.value])
    ),
  };
}

export async function GET(request: Request) {
  try {
    await prepareWorkflow();

    return Response.json({
      items: await getItems(),
      stages: defaultStages,
      templates,
      assigneeSettings: await getAssigneeSettings(),
      history: await getHistory(),
      settings: await getAppSettings(),
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
      action?: string;
      actor?: string;
      itemId?: number;
      title?: string;
      assignee?: string;
      category?: string;
      memo?: string;
      dueDate?: string;
      templateKey?: string;
      blockers?: string;
    };
    const actor = getActor(request, payload.actor);
    const d1 = getD1();

    if (payload.action === "create-subtask") {
      const itemId = Number(payload.itemId);
      const title = payload.title?.trim().slice(0, 160) ?? "";
      const dueDate = normalizeDate(payload.dueDate);
      const blockers = payload.blockers?.trim().slice(0, 500) ?? "";

      if (!Number.isFinite(itemId) || !title) {
        return Response.json({ error: "세부 체크리스트 내용이 필요합니다." }, { status: 400 });
      }

      const item = await d1
        .prepare("SELECT title FROM workflow_items WHERE id = ?")
        .bind(itemId)
        .first<{ title: string }>();

      if (!item) {
        return Response.json({ error: "업무를 찾을 수 없습니다." }, { status: 404 });
      }

      const last = await d1
        .prepare("SELECT MAX(position) AS position FROM workflow_subtasks WHERE item_id = ?")
        .bind(itemId)
        .first<{ position: number | null }>();
      const now = new Date().toISOString();

      await d1
        .prepare(`INSERT INTO workflow_subtasks (
          item_id,
          title,
          due_date,
          blockers,
          status,
          position,
          updated_by,
          updated_at,
          created_at
        ) VALUES (?, ?, ?, ?, 'todo', ?, ?, ?, ?)`)
        .bind(
          itemId,
          title,
          dueDate,
          blockers,
          Number(last?.position ?? 0) + 1,
          actor,
          now,
          now
        )
        .run();

      await logHistory({
        itemId,
        entityType: "subtask",
        action: "create",
        summary: `${actor}님이 '${item.title}'에 세부 체크리스트 '${title}'을 추가함`,
        actor,
      });

      return Response.json(
        {
          item: await getItem(itemId),
          history: await getHistory(),
        },
        { status: 201 }
      );
    }

    const title = payload.title?.trim().slice(0, 120) ?? "";
    const assignee = payload.assignee?.trim().slice(0, 80) ?? "";
    const category = payload.category?.trim().slice(0, 80) || "일반 업무";
    const memo = payload.memo?.trim().slice(0, 1000) ?? "";
    const dueDate = normalizeDate(payload.dueDate);

    if (!title) {
      return Response.json({ error: "업무명을 입력해 주세요." }, { status: 400 });
    }

    const last = await d1
      .prepare("SELECT MAX(position) AS position FROM workflow_items")
      .first<{ position: number | null }>();
    const itemId = await createItemWithDefaultSteps({
      title,
      assignee: assignee || "미지정",
      category,
      memo,
      dueDate,
      templateKey: payload.templateKey,
      actor,
      position: Number(last?.position ?? 0) + 1,
    });
    const item = await getItem(itemId);

    return Response.json(
      {
        item,
        history: await getHistory(),
      },
      { status: 201 }
    );
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
      action?: string;
      actor?: string;
      itemId?: number;
      order?: number[];
      stepId?: number;
      subtaskId?: number;
      title?: string;
      assignee?: string;
      category?: string;
      memo?: string;
      dueDate?: string | null;
      blockers?: string;
      color?: string;
      organizationName?: string;
      boardTitle?: string;
      status?: StepStatus;
    };
    const now = new Date().toISOString();
    const actor = getActor(request, payload.actor);
    const d1 = getD1();

    if (payload.action === "update-settings") {
      const organizationName =
        typeof payload.organizationName === "string"
          ? payload.organizationName.trim().slice(0, 80)
          : "";
      const boardTitle =
        typeof payload.boardTitle === "string"
          ? payload.boardTitle.trim().slice(0, 80)
          : "";

      if (!organizationName || !boardTitle) {
        return Response.json(
          { error: "조직명과 보드명을 입력해 주세요." },
          { status: 400 }
        );
      }

      await d1.batch([
        d1
          .prepare(`INSERT INTO app_settings (key, value, updated_at)
            VALUES ('organizationName', ?, ?)
            ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`)
          .bind(organizationName, now),
        d1
          .prepare(`INSERT INTO app_settings (key, value, updated_at)
            VALUES ('boardTitle', ?, ?)
            ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`)
          .bind(boardTitle, now),
      ]);

      await logHistory({
        entityType: "settings",
        action: "update",
        summary: `${actor}님이 보드 설정을 변경함`,
        actor,
      });

      return Response.json({
        settings: await getAppSettings(),
        history: await getHistory(),
      });
    }

    if (Array.isArray(payload.order)) {
      const order = payload.order.map(Number);
      const uniqueOrder = new Set(order);

      if (!order.length || order.some((id) => !Number.isFinite(id))) {
        return Response.json({ error: "저장할 순서가 필요합니다." }, { status: 400 });
      }

      if (uniqueOrder.size !== order.length) {
        return Response.json({ error: "중복된 업무 순서가 있습니다." }, { status: 400 });
      }

      const existing = await d1
        .prepare("SELECT id FROM workflow_items")
        .all<{ id: number }>();
      const existingIds = new Set((existing.results ?? []).map((item) => item.id));

      if (order.some((id) => !existingIds.has(id))) {
        return Response.json({ error: "업무 순서를 확인해 주세요." }, { status: 400 });
      }

      await d1.batch(
        order.map((id, index) =>
          d1
            .prepare(`UPDATE workflow_items
              SET position = ?,
                updated_by = ?,
                updated_at = ?
              WHERE id = ?`)
            .bind(index + 1, actor, now, id)
        )
      );

      await logHistory({
        entityType: "item",
        action: "reorder",
        summary: `${actor}님이 업무 순서를 변경함`,
        actor,
      });

      return Response.json({ items: await getItems(), history: await getHistory() });
    }

    if (payload.action === "set-assignee-color") {
      const assignee = payload.assignee?.trim().slice(0, 80) ?? "";
      const color = payload.color?.trim() ?? "";

      if (!assignee || !/^#[0-9a-fA-F]{6}$/.test(color)) {
        return Response.json({ error: "담당자와 색상값이 필요합니다." }, { status: 400 });
      }

      await d1
        .prepare(`INSERT INTO assignee_settings (assignee, color, updated_at)
          VALUES (?, ?, ?)
          ON CONFLICT(assignee) DO UPDATE SET color = excluded.color, updated_at = excluded.updated_at`)
        .bind(assignee, color, now)
        .run();

      await logHistory({
        entityType: "assignee",
        action: "color",
        summary: `${actor}님이 '${assignee}' 담당자 색상을 변경함`,
        actor,
      });

      return Response.json({
        assigneeSettings: await getAssigneeSettings(),
        history: await getHistory(),
      });
    }

    if (Number.isFinite(Number(payload.subtaskId))) {
      const subtaskId = Number(payload.subtaskId);
      const subtask = await d1
        .prepare(`SELECT s.*, i.title AS item_title
          FROM workflow_subtasks s
          JOIN workflow_items i ON i.id = s.item_id
          WHERE s.id = ?`)
        .bind(subtaskId)
        .first<WorkflowSubtaskRow & { item_title: string }>();

      if (!subtask) {
        return Response.json({ error: "세부 체크리스트를 찾을 수 없습니다." }, { status: 404 });
      }

      const title =
        typeof payload.title === "string"
          ? payload.title.trim().slice(0, 160)
          : subtask.title;
      const dueDate =
        typeof payload.dueDate === "string" || payload.dueDate === null
          ? normalizeDate(payload.dueDate)
          : subtask.due_date;
      const blockers =
        typeof payload.blockers === "string"
          ? payload.blockers.trim().slice(0, 500)
          : subtask.blockers;
      const status =
        payload.status === "done" || payload.status === "todo"
          ? payload.status
          : subtask.status;

      if (!title) {
        return Response.json({ error: "세부 체크리스트 내용이 필요합니다." }, { status: 400 });
      }

      await d1
        .prepare(`UPDATE workflow_subtasks
          SET title = ?,
            due_date = ?,
            blockers = ?,
            status = ?,
            updated_by = ?,
            updated_at = ?
          WHERE id = ?`)
        .bind(title, dueDate, blockers, status, actor, now, subtaskId)
        .run();

      const summary =
        status !== subtask.status
          ? `${actor}님이 '${subtask.item_title}' 세부 체크리스트 '${title}'을 ${status === "done" ? "완료" : "미완료"}로 변경함`
          : `${actor}님이 '${subtask.item_title}' 세부 체크리스트를 수정함`;

      await logHistory({
        itemId: subtask.item_id,
        entityType: "subtask",
        entityId: subtaskId,
        action: "update",
        summary,
        actor,
      });

      return Response.json({
        item: await getItem(subtask.item_id),
        history: await getHistory(),
      });
    }

    if (Number.isFinite(Number(payload.stepId))) {
      const stepId = Number(payload.stepId);
      const step = await d1
        .prepare(`SELECT s.*, i.title AS item_title
          FROM workflow_steps s
          JOIN workflow_items i ON i.id = s.item_id
          WHERE s.id = ?`)
        .bind(stepId)
        .first<WorkflowStepRow & { item_title: string }>();

      if (!step) {
        return Response.json({ error: "단계를 찾을 수 없습니다." }, { status: 404 });
      }

      if (typeof payload.dueDate === "string" || payload.dueDate === null) {
        const dueDate = normalizeDate(payload.dueDate);

        await d1.batch([
          d1
            .prepare("UPDATE workflow_steps SET due_date = ?, updated_by = ?, updated_at = ? WHERE id = ?")
            .bind(dueDate, actor, now, stepId),
          d1
            .prepare("UPDATE workflow_items SET updated_by = ?, updated_at = ? WHERE id = ?")
            .bind(actor, now, step.item_id),
        ]);

        await logHistory({
          itemId: step.item_id,
          entityType: "step",
          entityId: stepId,
          action: "due-date",
          summary: `${actor}님이 '${step.item_title}'의 '${step.title}' 목표일을 ${dueDate ?? "비움"}으로 변경함`,
          actor,
        });

        return Response.json({
          item: await getItem(step.item_id),
          history: await getHistory(),
        });
      }

      if (payload.status !== "done" && payload.status !== "todo") {
        return Response.json({ error: "단계 상태가 필요합니다." }, { status: 400 });
      }

      if (payload.status === "done") {
        const previous = await d1
          .prepare(`SELECT COUNT(*) AS count
            FROM workflow_steps
            WHERE item_id = ? AND position < ? AND status != 'done'`)
          .bind(step.item_id, step.position)
          .first<{ count: number }>();

        if (Number(previous?.count ?? 0) > 0) {
          return Response.json(
            { error: "이전 단계부터 순서대로 완료해야 합니다." },
            { status: 400 }
          );
        }
      }

      if (payload.status === "todo") {
        await d1.batch([
          d1
            .prepare(`UPDATE workflow_steps
              SET status = 'todo',
                completed_at = NULL,
                updated_by = ?,
                updated_at = ?
              WHERE item_id = ? AND position >= ?`)
            .bind(actor, now, step.item_id, step.position),
          d1
            .prepare(
              "UPDATE workflow_items SET updated_by = ?, updated_at = ? WHERE id = ?"
            )
            .bind(actor, now, step.item_id),
        ]);
      } else {
        await d1.batch([
          d1
            .prepare(`UPDATE workflow_steps
              SET status = 'done',
                completed_at = ?,
                updated_by = ?,
                updated_at = ?
              WHERE id = ?`)
            .bind(now, actor, now, stepId),
          d1
            .prepare(
              "UPDATE workflow_items SET updated_by = ?, updated_at = ? WHERE id = ?"
            )
            .bind(actor, now, step.item_id),
        ]);
      }

      const summary = `${actor}님이 '${step.item_title}'의 '${step.title}' 단계를 ${payload.status === "done" ? "완료" : "미완료"}로 변경함`;

      await logHistory({
        itemId: step.item_id,
        entityType: "step",
        entityId: stepId,
        action: "status",
        summary,
        actor,
      });

      return Response.json({
        item: await getItem(step.item_id),
        history: await getHistory(),
      });
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
      const category =
        typeof payload.category === "string"
          ? payload.category.trim().slice(0, 80) || "일반 업무"
          : existing.category;
      const memo =
        typeof payload.memo === "string"
          ? payload.memo.trim().slice(0, 1000)
          : existing.memo;
      const dueDate =
        typeof payload.dueDate === "string" || payload.dueDate === null
          ? normalizeDate(payload.dueDate)
          : existing.due_date;

      if (!title) {
        return Response.json({ error: "업무명을 입력해 주세요." }, { status: 400 });
      }

      await d1
        .prepare(`UPDATE workflow_items
          SET title = ?,
            assignee = ?,
            category = ?,
            memo = ?,
            due_date = ?,
            updated_by = ?,
            updated_at = ?
          WHERE id = ?`)
        .bind(title, assignee, category, memo, dueDate, actor, now, itemId)
        .run();

      await d1
        .prepare(
          "INSERT OR IGNORE INTO assignee_settings (assignee, color, updated_at) VALUES (?, '#e6f4ef', ?)"
        )
        .bind(assignee, now)
        .run();

      await logHistory({
        itemId,
        entityType: "item",
        entityId: itemId,
        action: "update",
        summary: `${actor}님이 '${title}' 업무 정보를 수정함`,
        actor,
      });

      return Response.json({
        item: await getItem(itemId),
        assigneeSettings: await getAssigneeSettings(),
        history: await getHistory(),
      });
    }

    return Response.json({ error: "변경할 업무가 필요합니다." }, { status: 400 });
  } catch (error) {
    return Response.json(
      { error: toRouteErrorMessage(error) },
      { status: 500 }
    );
  }
}

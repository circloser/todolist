import { getD1 } from "../../../db";

type StepStatus = "todo" | "done";

type WorkflowItemRow = {
  id: number;
  title: string;
  assignee: string;
  category: string;
  memo: string;
  allocated_budget: number | null;
  required_budget: number | null;
  due_date: string | null;
  location: string | null;
  lat: number | null;
  lng: number | null;
  links: string | null;
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

type StageTuple = [
  key: string,
  title: string,
  group: string,
  description: string,
  progress: number | null,
];

const rawTemplates: Array<{
  key: string;
  name: string;
  description: string;
  stages: StageTuple[];
}> = [
  {
    key: "external-research-outsourcing",
    name: "외부 학술/조사 용역",
    description: "공공 조달, 계약, 보고, 검수, 지급이 포함된 외부 용역",
    stages: [
      ["basic-plan", "기본계획(초안)", "준비", "사업 범위와 추진 방향을 정리합니다.", null],
      ["spec-estimate", "과업지시서/견적", "준비", "과업지시서와 견적 근거를 마련합니다.", null],
      ["audit-approval", "일상감사/결재", "결재", "감사와 내부 결재를 진행합니다.", null],
      ["procurement-order", "조달/발주", "조달", "조달 요청과 발주 절차를 진행합니다.", null],
      ["contract", "계약", "계약", "계약 체결 여부를 확인합니다.", null],
      ["kickoff", "착수", "수행", "착수 보고와 수행 시작을 확인합니다.", null],
      ["mid-report", "중간보고(50%)", "수행", "중간 산출물과 진행률을 점검합니다.", 50],
      ["final-report", "최종보고(90%)", "수행", "최종 산출물 제출 전 검토를 진행합니다.", 90],
      ["completion-inspection", "완료계/검수", "검수", "완료계 접수와 검수를 처리합니다.", 100],
      ["payment", "대금지급", "정산", "대금 지급 절차를 진행합니다.", null],
      ["archive-deliverables", "성과물등록", "아카이빙", "최종 성과물을 등록합니다.", null],
    ],
  },
  {
    key: "internal-rnd-survey",
    name: "내부 자체 연구 및 현장 조사",
    description: "내부 연구, 현장 조사, 분석, 보고서 작성 중심 업무",
    stages: [
      ["research-plan", "연구계획(초안)", "기획", "연구 목적과 조사 범위를 정리합니다.", null],
      ["internal-review", "내부심의/결재", "결재", "내부 심의와 결재를 진행합니다.", null],
      ["equipment-ready", "장비/물품준비", "준비", "현장 장비와 물품을 준비합니다.", null],
      ["field-1", "1차 현장조사", "조사", "1차 현장 데이터를 수집합니다.", null],
      ["field-2", "2차 현장조사(50%)", "조사", "보완 조사와 핵심 데이터를 확보합니다.", 50],
      ["data-analysis", "데이터분석", "분석", "수집 자료를 정리하고 분석합니다.", null],
      ["draft-report", "보고서(초안)", "보고", "초안 보고서를 작성합니다.", null],
      ["seminar-advice", "내부자문/세미나", "검토", "내부 자문과 세미나를 진행합니다.", null],
      ["final-report", "최종보고서(100%)", "보고", "최종 보고서를 확정합니다.", 100],
      ["institution-report", "원내보고", "보고", "원내 보고 절차를 완료합니다.", null],
      ["archive", "아카이빙", "아카이빙", "자료와 결과물을 보존합니다.", null],
    ],
  },
  {
    key: "ecological-restoration-construction",
    name: "생태 복원 및 조성 공사",
    description: "습지 복원, 서식처 조성, 시공, 준공, 유지관리 이관",
    stages: [
      ["concept-plan", "기본구상(초안)", "기획", "복원 목표와 기본 구상을 정리합니다.", null],
      ["design-estimate", "실시설계/내역서", "설계", "설계와 내역서를 마련합니다.", null],
      ["budget-approval", "예산결재", "결재", "예산 결재를 완료합니다.", null],
      ["order-contract", "발주/계약", "계약", "발주와 계약을 진행합니다.", null],
      ["site-handover", "착공/현장인수", "시공", "현장 인수와 착공을 확인합니다.", null],
      ["earthwork", "기반조성/토공사(25%)", "시공", "기반 조성과 토공사를 진행합니다.", 25],
      ["plant-facility", "식재/시설물설치(75%)", "시공", "식재와 시설물 설치를 진행합니다.", 75],
      ["completion-inspection", "준공검사(100%)", "검수", "준공 검사를 완료합니다.", 100],
      ["defect-plan", "하자보수계획", "유지관리", "하자보수 계획을 수립합니다.", null],
      ["payment", "대금지급", "정산", "대금 지급을 진행합니다.", null],
      ["maintenance-transfer", "유지관리이관", "이관", "유지관리 주체로 이관합니다.", null],
    ],
  },
  {
    key: "internal-admin-planning",
    name: "내부 일반 행정 및 기획",
    description: "기획, 검토, 결재, 시행, 결과 정리 중심의 내부 행정",
    stages: [
      ["planning-draft", "기획안(초안)", "기획", "기획 초안을 작성합니다.", null],
      ["case-research", "자료수집/사례조사", "조사", "관련 자료와 사례를 수집합니다.", null],
      ["department-opinion", "유관부서의견조회", "협의", "유관부서 의견을 조회합니다.", null],
      ["plan-writing", "기획서작성(진행중)", "작성", "기획서를 작성합니다.", null],
      ["first-review", "1차검토/수정", "검토", "1차 검토와 수정을 진행합니다.", null],
      ["manager-approval", "부서장결재(50%)", "결재", "부서장 결재를 진행합니다.", 50],
      ["agency-consultation", "유관기관협의", "협의", "유관기관과 협의합니다.", null],
      ["final-approval", "최종결재(100%)", "결재", "최종 결재를 완료합니다.", 100],
      ["implementation", "시행/공문발송", "시행", "시행과 공문 발송을 처리합니다.", null],
      ["result-summary", "결과정리", "정리", "결과 자료를 정리합니다.", null],
    ],
  },
];

type ResolvedTemplate = {
  key: string;
  name: string;
  description: string;
  stages: Array<{
    key: string;
    title: string;
    description: string;
    group: string;
    progress: number | null;
  }>;
};

const seedTemplates: ResolvedTemplate[] = rawTemplates.map((template) => ({
  ...template,
  stages: template.stages.map(([key, title, group, description, progress]) => ({
    key,
    title,
    group,
    description,
    progress,
  })),
}));

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

function normalizeBudget(value: unknown) {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  const amount =
    typeof value === "number"
      ? value
      : typeof value === "string"
        ? Number(value.replaceAll(",", "").trim())
        : Number.NaN;

  if (!Number.isFinite(amount) || amount < 0) {
    return null;
  }

  return Math.round(amount);
}

type TemplateRow = {
  template_key: string;
  name: string;
  description: string;
  position: number;
};

type TemplateStageRow = {
  template_key: string;
  stage_key: string;
  title: string;
  description: string;
  phase_group: string;
  progress_value: number | null;
  position: number;
};

function resolveTemplate(list: ResolvedTemplate[], key?: string) {
  return list.find((template) => template.key === key) ?? list[0];
}

type ItemLink = { title: string; url: string };

function normalizeLinks(value: unknown): ItemLink[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((entry) => {
      const record = entry as { title?: unknown; url?: unknown };
      const url =
        typeof record.url === "string" ? record.url.trim().slice(0, 500) : "";
      const title =
        typeof record.title === "string"
          ? record.title.trim().slice(0, 80)
          : "";

      return { title: title || url, url };
    })
    .filter((link) => /^https?:\/\//.test(link.url))
    .slice(0, 20);
}

function parseLinks(raw: string | null): ItemLink[] {
  if (!raw) {
    return [];
  }

  try {
    return normalizeLinks(JSON.parse(raw));
  } catch {
    return [];
  }
}

function normalizeCoord(value: unknown, min: number, max: number) {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  const amount =
    typeof value === "number"
      ? value
      : typeof value === "string"
        ? Number(value.trim())
        : Number.NaN;

  if (!Number.isFinite(amount) || amount < min || amount > max) {
    return null;
  }

  return amount;
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
    allocatedBudget: row.allocated_budget,
    requiredBudget: row.required_budget,
    dueDate: row.due_date,
    location: row.location ?? "",
    lat: row.lat,
    lng: row.lng,
    links: parseLinks(row.links),
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
      allocated_budget INTEGER,
      required_budget INTEGER,
      due_date TEXT,
      location TEXT NOT NULL DEFAULT '',
      lat REAL,
      lng REAL,
      links TEXT NOT NULL DEFAULT '[]',
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
    d1.prepare(`CREATE TABLE IF NOT EXISTS webhook_settings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL DEFAULT '팀 알림',
      url TEXT NOT NULL,
      enabled INTEGER NOT NULL DEFAULT 1,
      updated_at TEXT NOT NULL,
      created_at TEXT NOT NULL
    )`),
    d1.prepare(`CREATE TABLE IF NOT EXISTS workflow_templates (
      template_key TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      position INTEGER NOT NULL,
      updated_at TEXT NOT NULL,
      created_at TEXT NOT NULL
    )`),
    d1.prepare(`CREATE TABLE IF NOT EXISTS workflow_template_stages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      template_key TEXT NOT NULL,
      stage_key TEXT NOT NULL,
      title TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      phase_group TEXT NOT NULL DEFAULT '',
      progress_value INTEGER,
      position INTEGER NOT NULL,
      UNIQUE(template_key, stage_key)
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
    "ALTER TABLE workflow_items ADD COLUMN allocated_budget INTEGER"
  );
  await addColumnIfMissing(
    "ALTER TABLE workflow_items ADD COLUMN required_budget INTEGER"
  );
  await addColumnIfMissing(
    "ALTER TABLE workflow_items ADD COLUMN category TEXT NOT NULL DEFAULT '일반 업무'"
  );
  await addColumnIfMissing(
    "ALTER TABLE workflow_items ADD COLUMN template_key TEXT NOT NULL DEFAULT 'general-service'"
  );
  await addColumnIfMissing(
    "ALTER TABLE workflow_items ADD COLUMN location TEXT NOT NULL DEFAULT ''"
  );
  await addColumnIfMissing("ALTER TABLE workflow_items ADD COLUMN lat REAL");
  await addColumnIfMissing("ALTER TABLE workflow_items ADD COLUMN lng REAL");
  await addColumnIfMissing(
    "ALTER TABLE workflow_items ADD COLUMN links TEXT NOT NULL DEFAULT '[]'"
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

    const entries: Array<
      [string, { status: StepStatus; completedAt: string | null }]
    > = (legacy.results ?? []).map((task) => [
      task.template_key,
      {
        status: task.status === "done" ? "done" : "todo",
        completedAt: task.completed_at,
      },
    ]);

    return new Map(entries);
  } catch {
    return new Map<string, { status: StepStatus; completedAt: string | null }>();
  }
}

async function createItemWithDefaultSteps({
  title,
  assignee,
  category,
  memo,
  allocatedBudget,
  requiredBudget,
  dueDate,
  location,
  lat,
  lng,
  template,
  actor,
  position,
  legacyStatuses,
}: {
  title: string;
  assignee: string;
  category: string;
  memo: string;
  allocatedBudget?: number | null;
  requiredBudget?: number | null;
  dueDate?: string | null;
  location?: string;
  lat?: number | null;
  lng?: number | null;
  template: ResolvedTemplate;
  actor: string;
  position: number;
  legacyStatuses?: Map<string, { status: StepStatus; completedAt: string | null }>;
}) {
  const d1 = getD1();
  const now = new Date().toISOString();
  const selectedTemplate = template;
  const insertResult = await d1
    .prepare(`INSERT INTO workflow_items (
      title,
      assignee,
      category,
      memo,
      allocated_budget,
      required_budget,
      due_date,
      location,
      lat,
      lng,
      template_key,
      position,
      updated_by,
      updated_at,
      created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .bind(
      title,
      assignee,
      category,
      memo,
      allocatedBudget ?? null,
      requiredBudget ?? null,
      dueDate ?? null,
      location ?? "",
      lat ?? null,
      lng ?? null,
      selectedTemplate.key,
      position,
      actor,
      now,
      now
    )
    .run();
  const itemId = Number(insertResult.meta.last_row_id);

  await d1.batch(
    selectedTemplate.stages.map((stage, index) => {
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
  const seeded = await d1
    .prepare("SELECT value FROM app_settings WHERE key = 'defaultItemSeeded'")
    .first<{ value: string }>();

  if (seeded) {
    return;
  }

  const countResult = await d1
    .prepare("SELECT COUNT(*) AS count FROM workflow_items")
    .first<{ count: number }>();

  if (Number(countResult?.count ?? 0) > 0) {
    await d1
      .prepare(`INSERT INTO app_settings (key, value, updated_at)
        VALUES ('defaultItemSeeded', 'true', ?)
        ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`)
      .bind(new Date().toISOString())
      .run();
    return;
  }

  const defaultTemplate = resolveTemplate(await getTemplatesFromDb());
  await createItemWithDefaultSteps({
    title: "기본 업무",
    assignee: "미지정",
    category: defaultTemplate.name,
    memo: "",
    allocatedBudget: null,
    requiredBudget: null,
    template: defaultTemplate,
    actor: "템플릿",
    position: 1,
    legacyStatuses: await readLegacyStatuses(),
  });
  await d1
    .prepare(`INSERT INTO app_settings (key, value, updated_at)
      VALUES ('defaultItemSeeded', 'true', ?)
      ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`)
    .bind(new Date().toISOString())
    .run();
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

async function getTemplatesFromDb(): Promise<ResolvedTemplate[]> {
  const d1 = getD1();
  const [templatesResult, stagesResult] = await Promise.all([
    d1
      .prepare(
        "SELECT * FROM workflow_templates ORDER BY position, template_key"
      )
      .all<TemplateRow>(),
    d1
      .prepare(
        "SELECT * FROM workflow_template_stages ORDER BY template_key, position, id"
      )
      .all<TemplateStageRow>(),
  ]);

  const stagesByTemplate = new Map<string, TemplateStageRow[]>();

  for (const stage of stagesResult.results ?? []) {
    const current = stagesByTemplate.get(stage.template_key) ?? [];
    current.push(stage);
    stagesByTemplate.set(stage.template_key, current);
  }

  return (templatesResult.results ?? []).map((template) => ({
    key: template.template_key,
    name: template.name,
    description: template.description,
    stages: (stagesByTemplate.get(template.template_key) ?? []).map((stage) => ({
      key: stage.stage_key,
      title: stage.title,
      description: stage.description,
      group: stage.phase_group,
      progress: stage.progress_value,
    })),
  }));
}

async function ensureDefaultTemplates() {
  const d1 = getD1();
  const count = await d1
    .prepare("SELECT COUNT(*) AS count FROM workflow_templates")
    .first<{ count: number }>();

  if (Number(count?.count ?? 0) > 0) {
    return;
  }

  const now = new Date().toISOString();
  const statements: D1PreparedStatement[] = [];

  seedTemplates.forEach((template, templateIndex) => {
    statements.push(
      d1
        .prepare(
          `INSERT OR IGNORE INTO workflow_templates (template_key, name, description, position, updated_at, created_at)
           VALUES (?, ?, ?, ?, ?, ?)`
        )
        .bind(
          template.key,
          template.name,
          template.description,
          templateIndex + 1,
          now,
          now
        )
    );

    template.stages.forEach((stage, stageIndex) => {
      statements.push(
        d1
          .prepare(
            `INSERT OR IGNORE INTO workflow_template_stages (template_key, stage_key, title, description, phase_group, progress_value, position)
             VALUES (?, ?, ?, ?, ?, ?, ?)`
          )
          .bind(
            template.key,
            stage.key,
            stage.title,
            stage.description,
            stage.group,
            stage.progress,
            stageIndex + 1
          )
      );
    });
  });

  if (statements.length) {
    await d1.batch(statements);
  }
}

// When a template's stages change, sync the steps of every item using that
// template. Matched by stage_key so existing status/due dates are preserved;
// new stages are added as todo and removed stages are dropped.
async function reconcileItemsForTemplate(
  templateKey: string,
  stages: ResolvedTemplate["stages"],
  actor: string
) {
  const d1 = getD1();
  const now = new Date().toISOString();
  const itemsResult = await d1
    .prepare("SELECT id FROM workflow_items WHERE template_key = ?")
    .bind(templateKey)
    .all<{ id: number }>();
  const items = itemsResult.results ?? [];

  if (!items.length) {
    return;
  }

  const desiredKeys = new Set(stages.map((stage) => stage.key));

  for (const item of items) {
    const stepsResult = await d1
      .prepare("SELECT * FROM workflow_steps WHERE item_id = ?")
      .bind(item.id)
      .all<WorkflowStepRow>();
    const existing = stepsResult.results ?? [];
    const existingByKey = new Map(existing.map((step) => [step.stage_key, step]));
    const statements: D1PreparedStatement[] = [];

    for (const step of existing) {
      if (!desiredKeys.has(step.stage_key)) {
        statements.push(
          d1.prepare("DELETE FROM workflow_steps WHERE id = ?").bind(step.id)
        );
      }
    }

    stages.forEach((stage, index) => {
      const match = existingByKey.get(stage.key);

      if (match) {
        statements.push(
          d1
            .prepare(
              `UPDATE workflow_steps
               SET title = ?, description = ?, phase_group = ?, progress_value = ?, position = ?, updated_by = ?, updated_at = ?
               WHERE id = ?`
            )
            .bind(
              stage.title,
              stage.description,
              stage.group,
              stage.progress,
              index + 1,
              actor,
              now,
              match.id
            )
        );
      } else {
        statements.push(
          d1
            .prepare(
              `INSERT INTO workflow_steps (item_id, stage_key, title, description, phase_group, position, progress_value, status, due_date, completed_at, updated_by, updated_at, created_at)
               VALUES (?, ?, ?, ?, ?, ?, ?, 'todo', NULL, NULL, ?, ?, ?)`
            )
            .bind(
              item.id,
              stage.key,
              stage.title,
              stage.description,
              stage.group,
              index + 1,
              stage.progress,
              actor,
              now,
              now
            )
        );
      }
    });

    statements.push(
      d1
        .prepare(
          "UPDATE workflow_items SET updated_by = ?, updated_at = ? WHERE id = ?"
        )
        .bind(actor, now, item.id)
    );

    await d1.batch(statements);
  }
}

// Schema/seed setup is idempotent but expensive (DDL + ALTER probes on every
// call). Cache success per worker isolate so it runs once per cold start
// instead of on every request. A recycled isolate simply re-runs it once.
let workflowReady = false;

async function prepareWorkflow() {
  if (workflowReady) {
    return;
  }

  await ensureSchema();
  await ensureDefaultTemplates();
  await ensureDefaultItem();
  await ensureDefaultSettings();
  workflowReady = true;
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

type WebhookRow = {
  id: number;
  name: string;
  url: string;
  enabled: number;
  updated_at: string;
  created_at: string;
};

async function getWebhookSettings() {
  const row = await getD1()
    .prepare("SELECT * FROM webhook_settings ORDER BY id LIMIT 1")
    .first<WebhookRow>();

  return row
    ? { url: row.url, enabled: row.enabled === 1 }
    : { url: "", enabled: false };
}

// Due-date math on the server uses the Korean calendar day, not UTC.
function kstTodayIso() {
  return new Date(Date.now() + 9 * 3_600_000).toISOString().slice(0, 10);
}

function daysFromKstToday(dateIso: string) {
  const today = kstTodayIso();
  const toUtcMs = (iso: string) =>
    Date.UTC(
      Number(iso.slice(0, 4)),
      Number(iso.slice(5, 7)) - 1,
      Number(iso.slice(8, 10))
    );
  return Math.round((toUtcMs(dateIso) - toUtcMs(today)) / 86_400_000);
}

export async function GET(request: Request) {
  try {
    await prepareWorkflow();

    const templateList = await getTemplatesFromDb();

    return Response.json({
      items: await getItems(),
      stages: templateList[0]?.stages ?? [],
      legacyStages: defaultStages,
      templates: templateList,
      assigneeSettings: await getAssigneeSettings(),
      history: await getHistory(),
      settings: await getAppSettings(),
      webhook: await getWebhookSettings(),
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
      allocatedBudget?: number | string | null;
      requiredBudget?: number | string | null;
      dueDate?: string;
      location?: string;
      lat?: number | string | null;
      lng?: number | string | null;
      templateKey?: string;
      blockers?: string;
    };
    const actor = getActor(request, payload.actor);
    const d1 = getD1();

    if (payload.action === "send-deadline-alerts") {
      const webhook = await getWebhookSettings();

      if (!webhook.url || !webhook.enabled) {
        return Response.json(
          { error: "알림 웹훅이 설정되어 있지 않습니다. 보드 설정에서 웹훅 URL을 저장해 주세요." },
          { status: 400 }
        );
      }

      const items = await getItems();
      type Alert = { label: string; date: string; days: number };
      const groups = new Map<string, Alert[]>();
      let overdueTotal = 0;
      let urgentTotal = 0;

      for (const item of items) {
        const done =
          item.steps.length > 0 &&
          item.steps.every((step) => step.status === "done");

        if (done) {
          continue;
        }

        const entries: Alert[] = [];
        const next = item.steps.find((step) => step.status !== "done");

        if (next?.dueDate) {
          const days = daysFromKstToday(next.dueDate);
          if (days <= 3) {
            entries.push({
              label: `${item.title} — ${next.title}`,
              date: next.dueDate,
              days,
            });
          }
        }

        if (item.dueDate) {
          const days = daysFromKstToday(item.dueDate);
          if (days <= 3) {
            entries.push({
              label: `${item.title} — 최종 마감`,
              date: item.dueDate,
              days,
            });
          }
        }

        if (entries.length) {
          const who = item.assignee.trim() || "미지정";
          groups.set(who, [...(groups.get(who) ?? []), ...entries]);
          for (const entry of entries) {
            if (entry.days < 0) {
              overdueTotal += 1;
            } else {
              urgentTotal += 1;
            }
          }
        }
      }

      const total = overdueTotal + urgentTotal;

      if (!total) {
        return Response.json({ sent: 0 });
      }

      const settings = await getAppSettings();
      const lines: string[] = [
        `📋 [${settings.organizationName}] 마감 알림 (${kstTodayIso()})`,
        `🔴 지연 ${overdueTotal}건 · 🟡 임박(D-3 이내) ${urgentTotal}건`,
        "",
      ];

      for (const [assignee, entries] of groups) {
        lines.push(`■ ${assignee}`);
        for (const entry of entries.sort((a, b) => a.days - b.days)) {
          const badge =
            entry.days < 0
              ? `🔴 D+${Math.abs(entry.days)}`
              : entry.days <= 1
                ? `🟠 D-${entry.days}`
                : `🟡 D-${entry.days}`;
          lines.push(
            `  · ${badge} ${entry.label} (${entry.date.slice(5).replace("-", ".")})`
          );
        }
      }

      const text = lines.join("\n");
      const body = webhook.url.includes("discord.com/api/webhooks")
        ? { content: text }
        : { text };
      const response = await fetch(webhook.url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        return Response.json(
          { error: `웹훅 발송에 실패했습니다 (HTTP ${response.status}).` },
          { status: 502 }
        );
      }

      await logHistory({
        entityType: "notification",
        action: "send",
        summary: `${actor}님이 마감 알림 ${total}건을 웹훅으로 발송함`,
        actor,
      });

      return Response.json({ sent: total, history: await getHistory() });
    }

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
    const memo = payload.memo?.trim().slice(0, 1000) ?? "";
    const allocatedBudget = normalizeBudget(payload.allocatedBudget);
    const requiredBudget = normalizeBudget(payload.requiredBudget);
    const dueDate = normalizeDate(payload.dueDate);

    if (!title) {
      return Response.json({ error: "업무명을 입력해 주세요." }, { status: 400 });
    }

    const selectedTemplate = resolveTemplate(
      await getTemplatesFromDb(),
      payload.templateKey
    );
    // The type (template) is the task's category — they are one concept now.
    const category =
      payload.category?.trim().slice(0, 80) || selectedTemplate.name;

    const last = await d1
      .prepare("SELECT MAX(position) AS position FROM workflow_items")
      .first<{ position: number | null }>();
    const itemId = await createItemWithDefaultSteps({
      title,
      assignee: assignee || "미지정",
      category,
      memo,
      allocatedBudget,
      requiredBudget,
      dueDate,
      location:
        typeof payload.location === "string"
          ? payload.location.trim().slice(0, 120)
          : "",
      lat: normalizeCoord(payload.lat, -90, 90),
      lng: normalizeCoord(payload.lng, -180, 180),
      template: selectedTemplate,
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
      allocatedBudget?: number | string | null;
      requiredBudget?: number | string | null;
      dueDate?: string | null;
      location?: string;
      lat?: number | string | null;
      lng?: number | string | null;
      links?: Array<{ title?: string; url?: string }>;
      blockers?: string;
      color?: string;
      organizationName?: string;
      boardTitle?: string;
      status?: StepStatus;
      templateKey?: string;
      name?: string;
      description?: string;
      url?: string;
      enabled?: boolean;
      stages?: Array<{
        stageKey?: string;
        title?: string;
        description?: string;
        group?: string;
        progress?: number | string | null;
      }>;
    };
    const now = new Date().toISOString();
    const actor = getActor(request, payload.actor);
    const d1 = getD1();

    if (payload.action === "save-template") {
      const name =
        typeof payload.name === "string" ? payload.name.trim().slice(0, 80) : "";
      const description =
        typeof payload.description === "string"
          ? payload.description.trim().slice(0, 200)
          : "";
      const rawStages = Array.isArray(payload.stages) ? payload.stages : [];
      const stages = rawStages
        .map((stage, index) => {
          const title =
            typeof stage.title === "string" ? stage.title.trim().slice(0, 80) : "";
          const progressValue =
            stage.progress === null ||
            stage.progress === undefined ||
            stage.progress === ""
              ? null
              : normalizeBudget(stage.progress);

          return {
            key:
              typeof stage.stageKey === "string" && stage.stageKey.trim()
                ? stage.stageKey.trim()
                : `st-${crypto.randomUUID()}`,
            title,
            description:
              typeof stage.description === "string"
                ? stage.description.trim().slice(0, 200)
                : "",
            group:
              typeof stage.group === "string"
                ? stage.group.trim().slice(0, 40)
                : "",
            progress:
              progressValue !== null && progressValue >= 0 && progressValue <= 100
                ? progressValue
                : null,
            position: index + 1,
          };
        })
        .filter((stage) => stage.title);

      if (!name) {
        return Response.json({ error: "유형 이름을 입력해 주세요." }, { status: 400 });
      }

      if (!stages.length) {
        return Response.json(
          { error: "최소 한 개 이상의 단계가 필요합니다." },
          { status: 400 }
        );
      }

      // De-duplicate stage keys (a copied key would break reconciliation).
      const seenKeys = new Set<string>();
      for (const stage of stages) {
        if (seenKeys.has(stage.key)) {
          stage.key = `st-${crypto.randomUUID()}`;
        }
        seenKeys.add(stage.key);
      }

      const existingKey =
        typeof payload.templateKey === "string" && payload.templateKey.trim()
          ? payload.templateKey.trim()
          : "";
      const existing = existingKey
        ? await d1
            .prepare(
              "SELECT template_key FROM workflow_templates WHERE template_key = ?"
            )
            .bind(existingKey)
            .first<{ template_key: string }>()
        : null;
      const templateKey = existing ? existingKey : `tpl-${crypto.randomUUID()}`;

      const positionRow = existing
        ? null
        : await d1
            .prepare("SELECT MAX(position) AS position FROM workflow_templates")
            .first<{ position: number | null }>();
      const position = existing ? 0 : Number(positionRow?.position ?? 0) + 1;

      if (existing) {
        await d1
          .prepare(
            "UPDATE workflow_templates SET name = ?, description = ?, updated_at = ? WHERE template_key = ?"
          )
          .bind(name, description, now, templateKey)
          .run();
      } else {
        await d1
          .prepare(
            `INSERT INTO workflow_templates (template_key, name, description, position, updated_at, created_at)
             VALUES (?, ?, ?, ?, ?, ?)`
          )
          .bind(templateKey, name, description, position, now, now)
          .run();
      }

      await d1
        .prepare("DELETE FROM workflow_template_stages WHERE template_key = ?")
        .bind(templateKey)
        .run();
      await d1.batch(
        stages.map((stage) =>
          d1
            .prepare(
              `INSERT INTO workflow_template_stages (template_key, stage_key, title, description, phase_group, progress_value, position)
               VALUES (?, ?, ?, ?, ?, ?, ?)`
            )
            .bind(
              templateKey,
              stage.key,
              stage.title,
              stage.description,
              stage.group,
              stage.progress,
              stage.position
            )
        )
      );

      await reconcileItemsForTemplate(
        templateKey,
        stages.map((stage) => ({
          key: stage.key,
          title: stage.title,
          description: stage.description,
          group: stage.group,
          progress: stage.progress,
        })),
        actor
      );

      await logHistory({
        entityType: "template",
        action: existing ? "update" : "create",
        summary: `${actor}님이 '${name}' 유형의 단계를 ${existing ? "수정" : "추가"}함`,
        actor,
      });

      return Response.json({
        templates: await getTemplatesFromDb(),
        items: await getItems(),
        history: await getHistory(),
      });
    }

    if (payload.action === "delete-template") {
      const templateKey =
        typeof payload.templateKey === "string" ? payload.templateKey.trim() : "";

      if (!templateKey) {
        return Response.json({ error: "삭제할 유형이 필요합니다." }, { status: 400 });
      }

      const template = await d1
        .prepare("SELECT name FROM workflow_templates WHERE template_key = ?")
        .bind(templateKey)
        .first<{ name: string }>();

      if (!template) {
        return Response.json({ error: "유형을 찾을 수 없습니다." }, { status: 404 });
      }

      const inUse = await d1
        .prepare("SELECT COUNT(*) AS count FROM workflow_items WHERE template_key = ?")
        .bind(templateKey)
        .first<{ count: number }>();

      if (Number(inUse?.count ?? 0) > 0) {
        return Response.json(
          { error: "이 유형을 사용하는 업무가 있어 삭제할 수 없습니다." },
          { status: 400 }
        );
      }

      const remaining = await d1
        .prepare("SELECT COUNT(*) AS count FROM workflow_templates")
        .first<{ count: number }>();

      if (Number(remaining?.count ?? 0) <= 1) {
        return Response.json(
          { error: "최소 한 개의 유형은 남겨야 합니다." },
          { status: 400 }
        );
      }

      await d1.batch([
        d1
          .prepare("DELETE FROM workflow_template_stages WHERE template_key = ?")
          .bind(templateKey),
        d1
          .prepare("DELETE FROM workflow_templates WHERE template_key = ?")
          .bind(templateKey),
      ]);

      await logHistory({
        entityType: "template",
        action: "delete",
        summary: `${actor}님이 '${template.name}' 유형을 삭제함`,
        actor,
      });

      return Response.json({
        templates: await getTemplatesFromDb(),
        items: await getItems(),
        history: await getHistory(),
      });
    }

    if (payload.action === "save-webhook") {
      const url = typeof payload.url === "string" ? payload.url.trim().slice(0, 500) : "";
      const enabled = payload.enabled === true;

      if (url && !/^https:\/\//.test(url)) {
        return Response.json(
          { error: "웹훅 URL은 https:// 로 시작해야 합니다." },
          { status: 400 }
        );
      }

      await d1.prepare("DELETE FROM webhook_settings").run();

      if (url) {
        await d1
          .prepare(
            `INSERT INTO webhook_settings (name, url, enabled, updated_at, created_at)
             VALUES ('팀 알림', ?, ?, ?, ?)`
          )
          .bind(url, enabled ? 1 : 0, now, now)
          .run();
      }

      await logHistory({
        entityType: "settings",
        action: "webhook",
        summary: url
          ? `${actor}님이 알림 웹훅을 ${enabled ? "활성화" : "비활성"} 상태로 저장함`
          : `${actor}님이 알림 웹훅을 제거함`,
        actor,
      });

      return Response.json({
        webhook: await getWebhookSettings(),
        history: await getHistory(),
      });
    }

    if (payload.action === "set-item-template") {
      const itemId = Number(payload.itemId);
      const templateKey =
        typeof payload.templateKey === "string" ? payload.templateKey.trim() : "";

      if (!Number.isFinite(itemId) || !templateKey) {
        return Response.json(
          { error: "업무와 유형이 필요합니다." },
          { status: 400 }
        );
      }

      const item = await d1
        .prepare("SELECT title FROM workflow_items WHERE id = ?")
        .bind(itemId)
        .first<{ title: string }>();

      if (!item) {
        return Response.json({ error: "업무를 찾을 수 없습니다." }, { status: 404 });
      }

      const template = (await getTemplatesFromDb()).find(
        (candidate) => candidate.key === templateKey
      );

      if (!template) {
        return Response.json({ error: "유형을 찾을 수 없습니다." }, { status: 404 });
      }

      await d1
        .prepare(
          "UPDATE workflow_items SET template_key = ?, category = ?, updated_by = ?, updated_at = ? WHERE id = ?"
        )
        .bind(templateKey, template.name, actor, now, itemId)
        .run();
      await reconcileItemsForTemplate(templateKey, template.stages, actor);

      await logHistory({
        itemId,
        entityType: "item",
        entityId: itemId,
        action: "template",
        summary: `${actor}님이 '${item.title}' 업무 유형을 '${template.name}'(으)로 변경함`,
        actor,
      });

      return Response.json({
        item: await getItem(itemId),
        items: await getItems(),
        history: await getHistory(),
      });
    }

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
      const allocatedBudget =
        "allocatedBudget" in payload
          ? normalizeBudget(payload.allocatedBudget)
          : existing.allocated_budget;
      const requiredBudget =
        "requiredBudget" in payload
          ? normalizeBudget(payload.requiredBudget)
          : existing.required_budget;
      const dueDate =
        typeof payload.dueDate === "string" || payload.dueDate === null
          ? normalizeDate(payload.dueDate)
          : existing.due_date;
      const location =
        typeof payload.location === "string"
          ? payload.location.trim().slice(0, 120)
          : existing.location ?? "";
      const lat =
        "lat" in payload ? normalizeCoord(payload.lat, -90, 90) : existing.lat;
      const lng =
        "lng" in payload ? normalizeCoord(payload.lng, -180, 180) : existing.lng;
      const links = Array.isArray(payload.links)
        ? JSON.stringify(normalizeLinks(payload.links))
        : existing.links ?? "[]";

      if (!title) {
        return Response.json({ error: "업무명을 입력해 주세요." }, { status: 400 });
      }

      await d1
        .prepare(`UPDATE workflow_items
          SET title = ?,
            assignee = ?,
            category = ?,
            memo = ?,
            allocated_budget = ?,
            required_budget = ?,
            due_date = ?,
            location = ?,
            lat = ?,
            lng = ?,
            links = ?,
            updated_by = ?,
            updated_at = ?
          WHERE id = ?`)
        .bind(
          title,
          assignee,
          category,
          memo,
          allocatedBudget,
          requiredBudget,
          dueDate,
          location,
          lat,
          lng,
          links,
          actor,
          now,
          itemId
        )
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

export async function DELETE(request: Request) {
  try {
    await prepareWorkflow();

    const payload = (await request.json().catch(() => ({}))) as {
      actor?: string;
      itemId?: number;
    };
    const itemId = Number(payload.itemId);
    const actor = getActor(request, payload.actor);
    const d1 = getD1();

    if (!Number.isFinite(itemId)) {
      return Response.json({ error: "삭제할 업무를 선택해 주세요." }, { status: 400 });
    }

    const item = await d1
      .prepare("SELECT title FROM workflow_items WHERE id = ?")
      .bind(itemId)
      .first<{ title: string }>();

    if (!item) {
      return Response.json({ error: "업무를 찾을 수 없습니다." }, { status: 404 });
    }

    await d1.batch([
      d1.prepare("DELETE FROM workflow_steps WHERE item_id = ?").bind(itemId),
      d1.prepare("DELETE FROM workflow_subtasks WHERE item_id = ?").bind(itemId),
      d1.prepare("DELETE FROM workflow_items WHERE id = ?").bind(itemId),
    ]);

    await logHistory({
      itemId,
      entityType: "item",
      entityId: itemId,
      action: "delete",
      summary: `${actor}님이 '${item.title}' 업무를 삭제함`,
      actor,
    });

    return Response.json({
      items: await getItems(),
      history: await getHistory(),
    });
  } catch (error) {
    return Response.json(
      { error: toRouteErrorMessage(error) },
      { status: 500 }
    );
  }
}

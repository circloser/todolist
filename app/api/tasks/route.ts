import { asc, eq, max } from "drizzle-orm";
import { getD1, getDb } from "../../../db";
import { workflowTasks } from "../../../db/schema";

const defaultWorkflow = [
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
    return "진행 보드 테이블이 아직 준비되지 않았습니다. 마이그레이션을 생성한 뒤 다시 배포해 주세요.";
  }

  return message;
}

async function ensureSchema() {
  const d1 = getD1();

  await d1.batch([
    d1.prepare(`CREATE TABLE IF NOT EXISTS workflow_tasks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      template_key TEXT NOT NULL UNIQUE,
      title TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      phase_group TEXT NOT NULL DEFAULT '',
      position INTEGER NOT NULL,
      progress_value INTEGER,
      status TEXT NOT NULL DEFAULT 'todo' CHECK(status IN ('todo', 'done')),
      assignee TEXT NOT NULL DEFAULT '',
      memo TEXT NOT NULL DEFAULT '',
      completed_at TEXT,
      updated_by TEXT NOT NULL DEFAULT '',
      updated_at TEXT NOT NULL,
      created_at TEXT NOT NULL
    )`),
    d1.prepare(
      "CREATE UNIQUE INDEX IF NOT EXISTS workflow_tasks_template_key_idx ON workflow_tasks (template_key)"
    ),
    d1.prepare(
      "CREATE INDEX IF NOT EXISTS workflow_tasks_position_idx ON workflow_tasks (position)"
    ),
  ]);
}

async function ensureDefaultWorkflow() {
  const d1 = getD1();
  const now = new Date().toISOString();
  const inserts = defaultWorkflow.map((task, index) =>
    d1
      .prepare(`INSERT OR IGNORE INTO workflow_tasks (
        template_key,
        title,
        description,
        phase_group,
        position,
        progress_value,
        status,
        assignee,
        memo,
        completed_at,
        updated_by,
        updated_at,
        created_at
      ) VALUES (?, ?, ?, ?, ?, ?, 'todo', '', '', NULL, '템플릿', ?, ?)`)
      .bind(
        task.key,
        task.title,
        task.description,
        task.group,
        index + 1,
        task.progress,
        now,
        now
      )
  );

  await d1.batch(inserts);
}

async function prepareWorkflow() {
  await ensureSchema();
  await ensureDefaultWorkflow();
}

export async function GET(request: Request) {
  try {
    await prepareWorkflow();

    const db = getDb();
    const tasks = await db
      .select()
      .from(workflowTasks)
      .orderBy(asc(workflowTasks.position), asc(workflowTasks.id));

    return Response.json({ tasks, viewer: getActor(request) });
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
    };
    const title = payload.title?.trim() ?? "";
    const assignee = payload.assignee?.trim().slice(0, 80) ?? "";

    if (!title) {
      return Response.json({ error: "업무명을 입력해 주세요." }, { status: 400 });
    }

    const db = getDb();
    const now = new Date().toISOString();
    const [lastPosition] = await db
      .select({ value: max(workflowTasks.position) })
      .from(workflowTasks);

    const [task] = await db
      .insert(workflowTasks)
      .values({
        templateKey: `custom-${globalThis.crypto.randomUUID()}`,
        title: title.slice(0, 120),
        description: "팀에서 추가한 업무입니다.",
        phaseGroup: "추가 업무",
        position: Number(lastPosition?.value ?? defaultWorkflow.length) + 1,
        progressValue: null,
        status: "todo",
        assignee,
        memo: "",
        completedAt: null,
        updatedBy: getActor(request),
        updatedAt: now,
        createdAt: now,
      })
      .returning();

    return Response.json({ task }, { status: 201 });
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
      id?: number;
      status?: string;
      assignee?: string;
      memo?: string;
    };
    const id = Number(payload.id);

    if (!Number.isFinite(id)) {
      return Response.json({ error: "업무 ID가 필요합니다." }, { status: 400 });
    }

    const now = new Date().toISOString();
    const values: {
      assignee?: string;
      completedAt?: string | null;
      memo?: string;
      status?: "todo" | "done";
      updatedAt: string;
      updatedBy: string;
    } = {
      updatedAt: now,
      updatedBy: getActor(request),
    };

    if (payload.status === "done" || payload.status === "todo") {
      values.status = payload.status;
      values.completedAt = payload.status === "done" ? now : null;
    }

    if (typeof payload.assignee === "string") {
      values.assignee = payload.assignee.trim().slice(0, 80);
    }

    if (typeof payload.memo === "string") {
      values.memo = payload.memo.trim().slice(0, 1000);
    }

    if (
      !("status" in values) &&
      !("assignee" in values) &&
      !("memo" in values)
    ) {
      return Response.json({ error: "변경할 내용이 없습니다." }, { status: 400 });
    }

    const db = getDb();
    const [task] = await db
      .update(workflowTasks)
      .set(values)
      .where(eq(workflowTasks.id, id))
      .returning();

    if (!task) {
      return Response.json({ error: "업무를 찾을 수 없습니다." }, { status: 404 });
    }

    return Response.json({ task });
  } catch (error) {
    return Response.json(
      { error: toRouteErrorMessage(error) },
      { status: 500 }
    );
  }
}

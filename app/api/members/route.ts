import { getD1 } from "../../../db";
import {
  memberNameKey,
  normalizeColor,
  normalizeMemberName,
  normalizeMemberRole,
  pickMemberColor,
  unregisteredAssignees,
} from "../../lib/team";
import {
  actorFrom,
  getAssigneeColors,
  getMember,
  listMembers,
  logTeamHistory,
  prepareTeamTables,
  routeError,
  toMember,
  type MemberRow,
} from "../team-store";
import { requireWorkspaceAccess } from "../workspace-auth";

// 구성원 관리: a per-board roster. Members double as the board's assignee
// list (names and row colors stay in sync with workspace_assignee_settings)
// and as the authors of 업무일지.

type MemberPayload = {
  action?: string;
  actor?: string;
  workspaceId?: string;
  workspacePassword?: string;
  id?: number;
  name?: string;
  role?: string;
  color?: string;
  active?: boolean;
  renameAssignments?: boolean;
  order?: number[];
};

async function membersResponse(workspaceId: string, extra: object = {}, status = 200) {
  return Response.json(
    {
      ...extra,
      members: await listMembers(workspaceId),
      assigneeSettings: await getAssigneeColors(workspaceId),
    },
    { status }
  );
}

function upsertAssigneeColor(workspaceId: string, name: string, color: string, now: string) {
  return getD1()
    .prepare(
      `INSERT INTO workspace_assignee_settings (workspace_id, assignee, color, updated_at)
       VALUES (?, ?, ?, ?)
       ON CONFLICT(workspace_id, assignee) DO UPDATE SET color = excluded.color, updated_at = excluded.updated_at`
    )
    .bind(workspaceId, name, color, now);
}

async function nextPosition(workspaceId: string) {
  const row = await getD1()
    .prepare(
      "SELECT COALESCE(MAX(position), -1) + 1 AS next FROM workspace_members WHERE workspace_id = ?"
    )
    .bind(workspaceId)
    .first<{ next: number }>();

  return row?.next ?? 0;
}

async function boardAssignees(workspaceId: string) {
  try {
    const rows = await getD1()
      .prepare(
        `SELECT TRIM(assignee) AS assignee, MIN(position) AS first_position
         FROM workflow_items
         WHERE workspace_id = ? AND TRIM(assignee) <> ''
         GROUP BY TRIM(assignee)
         ORDER BY first_position`
      )
      .bind(workspaceId)
      .all<{ assignee: string }>();

    return (rows.results ?? []).map((row) => row.assignee);
  } catch {
    return [];
  }
}

function findByName(members: Array<{ id: number; name: string }>, name: string, exceptId?: number) {
  const key = memberNameKey(name);
  return members.find(
    (member) => member.id !== exceptId && memberNameKey(member.name) === key
  );
}

async function readPayload(request: Request) {
  return (await request.json().catch(() => ({}))) as MemberPayload;
}

export async function GET(request: Request) {
  try {
    await prepareTeamTables();
    const access = await requireWorkspaceAccess(request);
    if ("response" in access) {
      return access.response;
    }

    return await membersResponse(access.workspace.id);
  } catch (error) {
    return routeError(error);
  }
}

export async function POST(request: Request) {
  try {
    await prepareTeamTables();
    const payload = await readPayload(request);
    const access = await requireWorkspaceAccess(request, payload);
    if ("response" in access) {
      return access.response;
    }

    const workspaceId = access.workspace.id;
    const actor = actorFrom(request, payload.actor);
    const d1 = getD1();
    const now = new Date().toISOString();
    const members = await listMembers(workspaceId);
    const colors = await getAssigneeColors(workspaceId);

    // Register every assignee name already used on the board in one go.
    if (payload.action === "import-assignees") {
      const names = unregisteredAssignees(members, await boardAssignees(workspaceId));
      let position = await nextPosition(workspaceId);

      if (names.length) {
        await d1.batch(
          names.map((name, index) =>
            d1
              .prepare(
                `INSERT OR IGNORE INTO workspace_members
                   (workspace_id, name, role, color, active, position, created_at, updated_at)
                 VALUES (?, ?, '', ?, 1, ?, ?, ?)`
              )
              .bind(
                workspaceId,
                name,
                colors[name] ?? pickMemberColor(members.length + index),
                position++,
                now,
                now
              )
          )
        );
        await logTeamHistory({
          workspaceId,
          entityType: "member",
          entityId: null,
          action: "import",
          summary: `${actor}님이 담당자 ${names.length}명을 구성원으로 등록함`,
          actor,
        });
      }

      return await membersResponse(workspaceId, { imported: names.length });
    }

    const name = normalizeMemberName(payload.name);

    if (!name) {
      return Response.json({ error: "구성원 이름을 입력해 주세요." }, { status: 400 });
    }

    if (findByName(members, name)) {
      return Response.json(
        { error: `'${name}' 구성원이 이미 등록되어 있습니다.` },
        { status: 409 }
      );
    }

    const color =
      normalizeColor(payload.color) ?? colors[name] ?? pickMemberColor(members.length);
    const result = await d1
      .prepare(
        `INSERT INTO workspace_members
           (workspace_id, name, role, color, active, position, created_at, updated_at)
         VALUES (?, ?, ?, ?, 1, ?, ?, ?)
         RETURNING *`
      )
      .bind(
        workspaceId,
        name,
        normalizeMemberRole(payload.role),
        color,
        await nextPosition(workspaceId),
        now,
        now
      )
      .first<MemberRow>();
    await upsertAssigneeColor(workspaceId, name, color, now).run();
    await logTeamHistory({
      workspaceId,
      entityType: "member",
      entityId: result?.id ?? null,
      action: "create",
      summary: `${actor}님이 구성원 '${name}' 등록함`,
      actor,
    });

    return await membersResponse(
      workspaceId,
      { member: result ? toMember(result) : undefined },
      201
    );
  } catch (error) {
    return routeError(error);
  }
}

export async function PATCH(request: Request) {
  try {
    await prepareTeamTables();
    const payload = await readPayload(request);
    const access = await requireWorkspaceAccess(request, payload);
    if ("response" in access) {
      return access.response;
    }

    const workspaceId = access.workspace.id;
    const actor = actorFrom(request, payload.actor);
    const d1 = getD1();
    const now = new Date().toISOString();

    if (payload.action === "reorder") {
      const members = await listMembers(workspaceId);
      const known = new Set(members.map((member) => member.id));
      const order = Array.isArray(payload.order)
        ? payload.order.map(Number).filter((id) => known.has(id))
        : [];
      const rest = members.filter((member) => !order.includes(member.id));
      const statements = [...order, ...rest.map((member) => member.id)].map(
        (id, position) =>
          d1
            .prepare(
              "UPDATE workspace_members SET position = ? WHERE workspace_id = ? AND id = ?"
            )
            .bind(position, workspaceId, id)
      );

      if (statements.length) {
        await d1.batch(statements);
      }

      return await membersResponse(workspaceId);
    }

    const id = Number(payload.id);
    const current = Number.isInteger(id) ? await getMember(workspaceId, id) : null;

    if (!current) {
      return Response.json({ error: "구성원을 찾을 수 없습니다." }, { status: 404 });
    }

    const name =
      payload.name === undefined ? current.name : normalizeMemberName(payload.name);
    const role =
      payload.role === undefined ? current.role : normalizeMemberRole(payload.role);
    const color =
      payload.color === undefined ? current.color : normalizeColor(payload.color);
    const active =
      typeof payload.active === "boolean" ? payload.active : current.active === 1;

    if (!name) {
      return Response.json({ error: "구성원 이름을 입력해 주세요." }, { status: 400 });
    }

    if (!color) {
      return Response.json({ error: "색상값이 올바르지 않습니다." }, { status: 400 });
    }

    const renamed = name !== current.name;

    if (renamed && findByName(await listMembers(workspaceId), name, current.id)) {
      return Response.json(
        { error: `'${name}' 구성원이 이미 등록되어 있습니다.` },
        { status: 409 }
      );
    }

    const statements = [
      d1
        .prepare(
          `UPDATE workspace_members
           SET name = ?, role = ?, color = ?, active = ?, updated_at = ?
           WHERE workspace_id = ? AND id = ?`
        )
        .bind(name, role, color, active ? 1 : 0, now, workspaceId, current.id),
      upsertAssigneeColor(workspaceId, name, color, now),
    ];
    let renamedItems = 0;

    if (renamed) {
      // Logs keep a name snapshot for display; keep it current.
      statements.push(
        d1
          .prepare(
            "UPDATE work_logs SET member_name = ? WHERE workspace_id = ? AND member_id = ?"
          )
          .bind(name, workspaceId, current.id),
        d1
          .prepare(
            "DELETE FROM workspace_assignee_settings WHERE workspace_id = ? AND assignee = ?"
          )
          .bind(workspaceId, current.name)
      );
    }

    await d1.batch(statements);

    if (renamed && payload.renameAssignments !== false) {
      try {
        const result = await d1
          .prepare(
            `UPDATE workflow_items SET assignee = ?, updated_at = ?
             WHERE workspace_id = ? AND TRIM(assignee) = ?`
          )
          .bind(name, now, workspaceId, current.name)
          .run();
        renamedItems = result.meta?.changes ?? 0;
      } catch {
        renamedItems = 0;
      }
    }

    const changes = [
      renamed ? `이름 '${current.name}' → '${name}'` : "",
      role !== current.role ? `역할 '${role || "없음"}'` : "",
      color !== current.color ? "색상" : "",
      active !== (current.active === 1) ? (active ? "활성화" : "비활성화") : "",
    ].filter(Boolean);

    if (changes.length) {
      await logTeamHistory({
        workspaceId,
        entityType: "member",
        entityId: current.id,
        action: "update",
        summary: `${actor}님이 구성원 '${name}' 정보를 변경함 (${changes.join(", ")})${
          renamedItems ? ` · 담당 업무 ${renamedItems}건 반영` : ""
        }`,
        actor,
      });
    }

    return await membersResponse(workspaceId, { renamedItems });
  } catch (error) {
    return routeError(error);
  }
}

export async function DELETE(request: Request) {
  try {
    await prepareTeamTables();
    const payload = await readPayload(request);
    const access = await requireWorkspaceAccess(request, payload);
    if ("response" in access) {
      return access.response;
    }

    const workspaceId = access.workspace.id;
    const actor = actorFrom(request, payload.actor);
    const id = Number(payload.id);
    const current = Number.isInteger(id) ? await getMember(workspaceId, id) : null;

    if (!current) {
      return Response.json({ error: "구성원을 찾을 수 없습니다." }, { status: 404 });
    }

    const logs = await getD1()
      .prepare(
        "SELECT COUNT(*) AS count FROM work_logs WHERE workspace_id = ? AND member_id = ?"
      )
      .bind(workspaceId, current.id)
      .first<{ count: number }>();

    if ((logs?.count ?? 0) > 0) {
      return Response.json(
        {
          error: `'${current.name}'님의 업무일지가 ${logs?.count}건 있어 삭제할 수 없습니다. 대신 비활성화해 주세요.`,
        },
        { status: 409 }
      );
    }

    await getD1()
      .prepare("DELETE FROM workspace_members WHERE workspace_id = ? AND id = ?")
      .bind(workspaceId, current.id)
      .run();
    await logTeamHistory({
      workspaceId,
      entityType: "member",
      entityId: current.id,
      action: "delete",
      summary: `${actor}님이 구성원 '${current.name}' 삭제함`,
      actor,
    });

    return await membersResponse(workspaceId);
  } catch (error) {
    return routeError(error);
  }
}

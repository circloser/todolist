import { getD1 } from "../../../db";
import {
  memberNameKey,
  normalizeColor,
  normalizeMemberName,
  normalizeMemberRole,
  pickMemberColor,
  unregisteredAssignees,
  LOG_VISIBILITY_LABEL,
  normalizePolicy,
  type AccessRole,
  type JoinRequest,
  type TeamPolicy,
} from "../../lib/team";
import {
  forbidden,
  requireWorkspaceAccess,
  viewerOf,
  type BoardAccess,
} from "../auth-store";
import {
  getAssigneeColors,
  getMember,
  getTeamPolicy,
  listMembers,
  logTeamHistory,
  prepareTeamTables,
  routeError,
  saveTeamPolicy,
  toMember,
  type MemberRow,
} from "../team-store";

// 구성원 관리: a per-board roster. Members double as the board's assignee
// list (names and row colors stay in sync with workspace_assignee_settings)
// and as the authors of 업무일지. Everyone on the board can see the roster;
// only 부서장 can change it, approve join requests or grant roles.

type MemberPayload = {
  action?: string;
  workspaceId?: string;
  id?: number;
  requestId?: number;
  memberId?: number | null;
  name?: string;
  role?: string;
  color?: string;
  active?: boolean;
  accessRole?: AccessRole;
  logViewer?: boolean;
  policy?: Partial<TeamPolicy>;
  renameAssignments?: boolean;
  order?: number[];
};

const MANAGER_ONLY = "구성원 관리는 부서장만 할 수 있습니다.";

async function joinRequests(workspaceId: string): Promise<JoinRequest[]> {
  const [rows, roster] = await Promise.all([
    getD1()
      .prepare(
        `SELECT r.id, r.user_id, r.name, r.created_at, u.login_id
         FROM workspace_join_requests r JOIN users u ON u.id = r.user_id
         WHERE r.workspace_id = ? ORDER BY r.created_at`
      )
      .bind(workspaceId)
      .all<{ id: number; user_id: number; name: string; created_at: string; login_id: string }>(),
    listMembers(workspaceId),
  ]);

  return (rows.results ?? []).map((row) => ({
    id: row.id,
    userId: row.user_id,
    loginId: row.login_id,
    name: row.name,
    createdAt: row.created_at,
    suggestedMemberId:
      roster.find(
        (member) => !member.hasAccount && memberNameKey(member.name) === memberNameKey(row.name)
      )?.id ?? null,
  }));
}

async function membersResponse(access: BoardAccess, extra: object = {}, status = 200) {
  const workspaceId = access.workspace.id;
  return Response.json(
    {
      ...extra,
      members: await listMembers(workspaceId, access.isManager),
      assigneeSettings: await getAssigneeColors(workspaceId),
      requests: access.isManager ? await joinRequests(workspaceId) : [],
      policy: await getTeamPolicy(workspaceId),
      viewer: viewerOf(access),
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

    return await membersResponse(access);
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
    if (!access.isManager) {
      return forbidden(MANAGER_ONLY);
    }

    const workspaceId = access.workspace.id;
    const actor = access.actor;
    const d1 = getD1();
    const now = new Date().toISOString();
    const members = await listMembers(workspaceId);
    const colors = await getAssigneeColors(workspaceId);

    if (payload.action === "approve-join" || payload.action === "reject-join") {
      const joinRequest = await d1
        .prepare("SELECT * FROM workspace_join_requests WHERE workspace_id = ? AND id = ?")
        .bind(workspaceId, Number(payload.requestId))
        .first<{ id: number; user_id: number; name: string }>();

      if (!joinRequest) {
        return Response.json({ error: "가입 신청을 찾을 수 없습니다." }, { status: 404 });
      }

      const dropRequest = d1
        .prepare("DELETE FROM workspace_join_requests WHERE id = ?")
        .bind(joinRequest.id);

      if (payload.action === "reject-join") {
        await dropRequest.run();
        await logTeamHistory({
          workspaceId,
          entityType: "member",
          entityId: null,
          action: "reject",
          summary: `${actor}님이 '${joinRequest.name}'의 가입 신청을 거절함`,
          actor,
        });
        return await membersResponse(access);
      }

      const accessRole: AccessRole = payload.accessRole === "manager" ? "manager" : "member";
      const linkId = Number(payload.memberId);
      let memberName = joinRequest.name;

      if (Number.isInteger(linkId) && linkId > 0) {
        // Link the account to an existing roster entry (their past items/logs).
        const target = await getMember(workspaceId, linkId);

        if (!target) {
          return Response.json({ error: "연결할 구성원을 찾을 수 없습니다." }, { status: 404 });
        }
        if (target.user_id !== null) {
          return Response.json(
            { error: `'${target.name}' 구성원은 이미 다른 계정과 연결되어 있습니다.` },
            { status: 409 }
          );
        }

        memberName = target.name;
        await d1.batch([
          d1
            .prepare(
              `UPDATE workspace_members
               SET user_id = ?, access_role = ?, active = 1, updated_at = ?
               WHERE id = ?`
            )
            .bind(joinRequest.user_id, accessRole, now, target.id),
          dropRequest,
        ]);
      } else {
        if (findByName(members, joinRequest.name)) {
          return Response.json(
            {
              error: `'${joinRequest.name}' 이름의 구성원이 이미 있습니다. 그 구성원에 연결하거나 신청을 거절해 주세요.`,
            },
            { status: 409 }
          );
        }

        const color = colors[joinRequest.name] ?? pickMemberColor(members.length);
        await d1.batch([
          d1
            .prepare(
              `INSERT INTO workspace_members
                 (workspace_id, name, role, color, active, position, user_id, access_role, created_at, updated_at)
               VALUES (?, ?, '', ?, 1, ?, ?, ?, ?, ?)`
            )
            .bind(
              workspaceId,
              joinRequest.name,
              color,
              await nextPosition(workspaceId),
              joinRequest.user_id,
              accessRole,
              now,
              now
            ),
          upsertAssigneeColor(workspaceId, joinRequest.name, color, now),
          dropRequest,
        ]);
      }

      await logTeamHistory({
        workspaceId,
        entityType: "member",
        entityId: null,
        action: "approve",
        summary: `${actor}님이 '${memberName}'의 가입을 승인함 (${accessRole === "manager" ? "부서장" : "구성원"})`,
        actor,
      });

      return await membersResponse(access);
    }

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

      return await membersResponse(access, { imported: names.length });
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
      access,
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
    if (!access.isManager) {
      return forbidden(MANAGER_ONLY);
    }

    const workspaceId = access.workspace.id;
    const actor = access.actor;
    const d1 = getD1();
    const now = new Date().toISOString();

    if (payload.action === "update-policy") {
      const before = await getTeamPolicy(workspaceId);
      const policy = normalizePolicy({ ...before, ...(payload.policy ?? {}) });
      await saveTeamPolicy(workspaceId, policy);

      const on = (value: boolean) => (value ? "켬" : "끔");
      const changes = [
        policy.logVisibility !== before.logVisibility
          ? `일지 열람: ${LOG_VISIBILITY_LABEL[policy.logVisibility]}`
          : "",
        policy.logApproval !== before.logApproval ? `일지 승인 절차 ${on(policy.logApproval)}` : "",
        policy.lockApprovedLogs !== before.lockApprovedLogs
          ? `승인 일지 잠금 ${on(policy.lockApprovedLogs)}`
          : "",
        policy.logBackdateDays !== before.logBackdateDays
          ? `지난 일지 작성 ${policy.logBackdateDays ? `${policy.logBackdateDays}일까지` : "제한 없음"}`
          : "",
        policy.memberCanCreateItems !== before.memberCanCreateItems
          ? `구성원 업무 등록 ${on(policy.memberCanCreateItems)}`
          : "",
        policy.memberCanDeleteItems !== before.memberCanDeleteItems
          ? `구성원 업무 삭제 ${on(policy.memberCanDeleteItems)}`
          : "",
      ].filter(Boolean);

      if (changes.length) {
        await logTeamHistory({
          workspaceId,
          entityType: "member",
          entityId: null,
          action: "policy",
          summary: `${actor}님이 운영 옵션을 변경함 (${changes.join(", ")})`,
          actor,
        });
      }

      return await membersResponse(access);
    }

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

      return await membersResponse(access);
    }

    const id = Number(payload.id);
    const current = Number.isInteger(id) ? await getMember(workspaceId, id) : null;

    if (!current) {
      return Response.json({ error: "구성원을 찾을 수 없습니다." }, { status: 404 });
    }

    const isSelf = current.id === access.member.id;

    // Account recovery: detach a lost account so a new one can be linked.
    if (payload.action === "unlink-account") {
      if (isSelf) {
        return forbidden("본인 계정 연결은 해제할 수 없습니다.");
      }
      await d1
        .prepare(
          "UPDATE workspace_members SET user_id = NULL, access_role = 'member', updated_at = ? WHERE id = ?"
        )
        .bind(now, current.id)
        .run();
      await logTeamHistory({
        workspaceId,
        entityType: "member",
        entityId: current.id,
        action: "unlink",
        summary: `${actor}님이 '${current.name}' 구성원의 계정 연결을 해제함`,
        actor,
      });
      return await membersResponse(access);
    }

    const name =
      payload.name === undefined ? current.name : normalizeMemberName(payload.name);
    const role =
      payload.role === undefined ? current.role : normalizeMemberRole(payload.role);
    const color =
      payload.color === undefined ? current.color : normalizeColor(payload.color);
    const active =
      typeof payload.active === "boolean" ? payload.active : current.active === 1;
    const accessRole: AccessRole =
      payload.accessRole === "manager" || payload.accessRole === "member"
        ? payload.accessRole
        : current.access_role === "manager"
          ? "manager"
          : "member";
    const logViewer =
      typeof payload.logViewer === "boolean" ? payload.logViewer : current.log_viewer === 1;

    if (!name) {
      return Response.json({ error: "구성원 이름을 입력해 주세요." }, { status: 400 });
    }

    if (!color) {
      return Response.json({ error: "색상값이 올바르지 않습니다." }, { status: 400 });
    }

    // A manager can't lock themselves out (which also guarantees the board
    // always keeps at least one 부서장).
    if (isSelf && (!active || accessRole !== "manager")) {
      return forbidden("본인을 비활성화하거나 부서장 권한을 해제할 수 없습니다.");
    }

    if (accessRole === "manager" && current.user_id === null) {
      return Response.json(
        { error: "계정이 연결된 구성원만 부서장으로 지정할 수 있습니다." },
        { status: 400 }
      );
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
           SET name = ?, role = ?, color = ?, active = ?, access_role = ?, log_viewer = ?, updated_at = ?
           WHERE workspace_id = ? AND id = ?`
        )
        .bind(
          name,
          role,
          color,
          active ? 1 : 0,
          accessRole,
          logViewer ? 1 : 0,
          now,
          workspaceId,
          current.id
        ),
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

    // Item ownership follows the assignee name, so a rename must carry the
    // member's items along with it.
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
      accessRole !== current.access_role ? (accessRole === "manager" ? "부서장 지정" : "부서장 해제") : "",
      logViewer !== (current.log_viewer === 1) ? (logViewer ? "일지 열람 허용" : "일지 열람 해제") : "",
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

    return await membersResponse(access, { renamedItems });
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
    if (!access.isManager) {
      return forbidden(MANAGER_ONLY);
    }

    const workspaceId = access.workspace.id;
    const actor = access.actor;
    const id = Number(payload.id);
    const current = Number.isInteger(id) ? await getMember(workspaceId, id) : null;

    if (!current) {
      return Response.json({ error: "구성원을 찾을 수 없습니다." }, { status: 404 });
    }

    if (current.id === access.member.id) {
      return forbidden("본인은 삭제할 수 없습니다.");
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

    return await membersResponse(access);
  } catch (error) {
    return routeError(error);
  }
}

import { getD1 } from "../../../db";
import {
  loginIdError,
  memberNameKey,
  normalizeLoginId,
  normalizeMemberName,
  passwordError,
  pickMemberColor,
} from "../../lib/team";
import {
  attemptLogin,
  boardHasManager,
  clearSessionCookie,
  createSession,
  createUser,
  destroyOtherSessions,
  destroySession,
  findUserByLoginId,
  getMembership,
  getSessionUser,
  getUserById,
  hashPassword,
  listBoardsForUser,
  prepareAuth,
  verifyPassword,
  type SessionUser,
} from "../auth-store";
import { logTeamHistory, routeError, type MemberRow } from "../team-store";
import {
  getWorkspaceById,
  normalizeWorkspaceId,
  verifyBoardPassword,
  workspaceLabel,
} from "../workspace-auth";

// 계정: sign up, sign in/out, change password, and ask to join a board.

type AuthPayload = {
  action?: string;
  loginId?: string;
  name?: string;
  password?: string;
  currentPassword?: string;
  newPassword?: string;
  workspaceId?: string;
  workspacePassword?: string;
};

async function pendingRequests(userId: number) {
  const rows = await getD1()
    .prepare(
      `SELECT r.workspace_id, r.name, r.created_at, w.department_name, w.team_name
       FROM workspace_join_requests r JOIN workspaces w ON w.id = r.workspace_id
       WHERE r.user_id = ? ORDER BY r.created_at DESC`
    )
    .bind(userId)
    .all<{
      workspace_id: string;
      name: string;
      created_at: string;
      department_name: string;
      team_name: string;
    }>();

  return (rows.results ?? []).map((row) => ({
    workspaceId: row.workspace_id,
    label: workspaceLabel(row),
    name: row.name,
    createdAt: row.created_at,
  }));
}

async function authState(user: SessionUser | null, extra: object = {}, init?: ResponseInit) {
  return Response.json(
    {
      ...extra,
      user,
      boards: user ? await listBoardsForUser(user.id) : [],
      pending: user ? await pendingRequests(user.id) : [],
    },
    init
  );
}

function withCookie(cookie: string, status = 200): ResponseInit {
  return { status, headers: { "Set-Cookie": cookie } };
}

export async function GET(request: Request) {
  try {
    await prepareAuth();
    return await authState(await getSessionUser(request));
  } catch (error) {
    return routeError(error);
  }
}

export async function POST(request: Request) {
  try {
    await prepareAuth();
    const payload = (await request.json().catch(() => ({}))) as AuthPayload;
    const d1 = getD1();

    if (payload.action === "signup") {
      const loginId = normalizeLoginId(payload.loginId);
      const name = normalizeMemberName(payload.name);
      const problem =
        loginIdError(loginId) ??
        (name ? null : "이름을 입력해 주세요.") ??
        passwordError(payload.password, loginId);

      if (problem) {
        return Response.json({ error: problem }, { status: 400 });
      }

      if (await findUserByLoginId(loginId)) {
        return Response.json({ error: "이미 사용 중인 아이디입니다." }, { status: 409 });
      }

      const user = await createUser(loginId, name, payload.password as string);

      if (!user) {
        throw new Error("계정을 만들지 못했습니다.");
      }

      const session: SessionUser = { id: user.id, loginId: user.login_id, name: user.name };
      return await authState(session, {}, withCookie(await createSession(request, user.id), 201));
    }

    if (payload.action === "login") {
      const loginId = normalizeLoginId(payload.loginId);
      const password = typeof payload.password === "string" ? payload.password : "";

      if (!loginId || !password) {
        return Response.json({ error: "아이디와 비밀번호를 입력해 주세요." }, { status: 400 });
      }

      const result = await attemptLogin(loginId, password);

      if (!result.ok) {
        return Response.json({ error: result.error }, { status: result.status });
      }

      const session: SessionUser = {
        id: result.user.id,
        loginId: result.user.login_id,
        name: result.user.name,
      };
      return await authState(session, {}, withCookie(await createSession(request, result.user.id)));
    }

    if (payload.action === "logout") {
      await destroySession(request);
      return Response.json({ user: null }, withCookie(clearSessionCookie(request)));
    }

    // Everything below needs a signed-in user.
    const user = await getSessionUser(request);

    if (!user) {
      return Response.json({ error: "로그인이 필요합니다.", requiresLogin: true }, { status: 401 });
    }

    if (payload.action === "change-password") {
      const row = await getUserById(user.id);
      const current = typeof payload.currentPassword === "string" ? payload.currentPassword : "";

      if (!row || !(await verifyPassword(current, row.password_hash))) {
        return Response.json({ error: "현재 비밀번호가 맞지 않습니다." }, { status: 401 });
      }

      const problem = passwordError(payload.newPassword, user.loginId);

      if (problem) {
        return Response.json({ error: problem }, { status: 400 });
      }

      await d1
        .prepare("UPDATE users SET password_hash = ?, updated_at = ? WHERE id = ?")
        .bind(await hashPassword(payload.newPassword as string), new Date().toISOString(), user.id)
        .run();
      // Sign out every other device that knew the old password.
      await destroyOtherSessions(request, user.id);

      return await authState(user, { changed: true });
    }

    if (payload.action === "join" || payload.action === "cancel-join") {
      const workspace = await getWorkspaceById(normalizeWorkspaceId(payload.workspaceId));

      if (!workspace) {
        return Response.json({ error: "보드를 찾을 수 없습니다." }, { status: 404 });
      }

      if (payload.action === "cancel-join") {
        await d1
          .prepare("DELETE FROM workspace_join_requests WHERE workspace_id = ? AND user_id = ?")
          .bind(workspace.id, user.id)
          .run();
        return await authState(user);
      }

      const existing = await getMembership(workspace.id, user.id);

      if (existing) {
        return existing.active === 1
          ? await authState(user, { joined: true })
          : Response.json(
              { error: "이 보드에서 비활성화된 구성원입니다. 부서장에게 문의해 주세요." },
              { status: 403 }
            );
      }

      const password = typeof payload.workspacePassword === "string" ? payload.workspacePassword.trim() : "";

      if (!(await verifyBoardPassword(workspace, password))) {
        return Response.json({ error: "보드 가입 암호가 맞지 않습니다." }, { status: 401 });
      }

      const name = normalizeMemberName(payload.name) || user.name;
      const now = new Date().toISOString();

      // A board nobody manages yet: the first person to join becomes its
      // 부서장 (and can then approve everyone else).
      if (!(await boardHasManager(workspace.id))) {
        const roster = await d1
          .prepare("SELECT * FROM workspace_members WHERE workspace_id = ?")
          .bind(workspace.id)
          .all<MemberRow>();
        const sameName = (roster.results ?? []).find(
          (member) => memberNameKey(member.name) === memberNameKey(name)
        );

        if (sameName && sameName.user_id !== null) {
          return Response.json(
            { error: `'${name}' 이름은 이미 다른 계정이 사용 중입니다. 다른 이름으로 신청해 주세요.` },
            { status: 409 }
          );
        }

        if (sameName) {
          await d1
            .prepare(
              `UPDATE workspace_members
               SET user_id = ?, access_role = 'manager', active = 1, updated_at = ?
               WHERE id = ?`
            )
            .bind(user.id, now, sameName.id)
            .run();
        } else {
          const position = (roster.results ?? []).reduce(
            (max, member) => Math.max(max, member.position + 1),
            0
          );
          await d1
            .prepare(
              `INSERT INTO workspace_members
                 (workspace_id, name, role, color, active, position, user_id, access_role, created_at, updated_at)
               VALUES (?, ?, '', ?, 1, ?, ?, 'manager', ?, ?)`
            )
            .bind(
              workspace.id,
              name,
              pickMemberColor(roster.results?.length ?? 0),
              position,
              user.id,
              now,
              now
            )
            .run();
        }

        await d1
          .prepare("DELETE FROM workspace_join_requests WHERE workspace_id = ? AND user_id = ?")
          .bind(workspace.id, user.id)
          .run();
        await logTeamHistory({
          workspaceId: workspace.id,
          entityType: "member",
          entityId: null,
          action: "join",
          summary: `${name}님이 첫 가입자로 부서장이 됨`,
          actor: name,
        });

        return await authState(user, { joined: true, becameManager: true });
      }

      await d1
        .prepare(
          `INSERT INTO workspace_join_requests (workspace_id, user_id, name, created_at)
           VALUES (?, ?, ?, ?)
           ON CONFLICT(workspace_id, user_id) DO UPDATE SET name = excluded.name, created_at = excluded.created_at`
        )
        .bind(workspace.id, user.id, name, now)
        .run();

      return await authState(user, { requested: true });
    }

    return Response.json({ error: "알 수 없는 요청입니다." }, { status: 400 });
  } catch (error) {
    return routeError(error);
  }
}

import { getD1 } from "../../../db";
import { normalizePlaceInput, placeKindOf, type MapPlace, type PlaceKind } from "../../lib/places";
import { forbidden, requireWorkspaceAccess, type BoardAccess } from "../auth-store";
import { logTeamHistory, prepareTeamTables, routeError } from "../team-store";

// 지도 장소: places pinned on the board map (사무실, 현장, 회의 장소…). Every
// member sees them and may add one; the person who added a place or a 부서장
// may change or delete it.

type PlaceRow = {
  id: number;
  workspace_id: string;
  name: string;
  kind: string;
  custom_kind: string;
  lat: number;
  lng: number;
  address: string;
  memo: string;
  created_by_member_id: number;
  created_by_name: string;
  updated_by: string;
  created_at: string;
  updated_at: string;
};

function toPlace(row: PlaceRow): MapPlace {
  return {
    id: row.id,
    name: row.name,
    kind: row.kind as PlaceKind,
    customKind: row.custom_kind,
    lat: row.lat,
    lng: row.lng,
    address: row.address,
    memo: row.memo,
    createdByMemberId: row.created_by_member_id,
    createdByName: row.created_by_name,
    updatedBy: row.updated_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

async function readPayload(request: Request) {
  return (await request.json().catch(() => ({}))) as Record<string, unknown>;
}

async function findPlace(workspaceId: string, id: unknown) {
  const placeId = Number(id);
  if (!Number.isInteger(placeId)) {
    return null;
  }
  return await getD1()
    .prepare("SELECT * FROM map_places WHERE workspace_id = ? AND id = ?")
    .bind(workspaceId, placeId)
    .first<PlaceRow>();
}

function editDenied(access: BoardAccess, row: PlaceRow) {
  return access.isManager || row.created_by_member_id === access.member.id
    ? null
    : forbidden("장소는 등록한 사람 또는 부서장만 수정·삭제할 수 있습니다.");
}

function describe(place: Pick<MapPlace, "name" | "kind" | "customKind">) {
  return `[${placeKindOf(place).label}] ${place.name}`;
}

export async function GET(request: Request) {
  try {
    await prepareTeamTables();
    const access = await requireWorkspaceAccess(request);
    if ("response" in access) {
      return access.response;
    }
    const rows = await getD1()
      .prepare("SELECT * FROM map_places WHERE workspace_id = ? ORDER BY kind, name, id LIMIT 2000")
      .bind(access.workspace.id)
      .all<PlaceRow>();
    return Response.json({ places: (rows.results ?? []).map(toPlace) });
  } catch (error) {
    return routeError(error);
  }
}

export async function POST(request: Request) {
  try {
    await prepareTeamTables();
    const payload = await readPayload(request);
    const access = await requireWorkspaceAccess(request, payload as { workspaceId?: unknown });
    if ("response" in access) {
      return access.response;
    }
    const input = normalizePlaceInput(payload);
    if ("error" in input) {
      return Response.json({ error: input.error }, { status: 400 });
    }
    const value = input.value;
    const now = new Date().toISOString();
    const row = await getD1()
      .prepare(
        `INSERT INTO map_places
           (workspace_id, name, kind, custom_kind, lat, lng, address, memo,
            created_by_member_id, created_by_name, updated_by, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         RETURNING *`
      )
      .bind(
        access.workspace.id,
        value.name,
        value.kind,
        value.customKind,
        value.lat,
        value.lng,
        value.address,
        value.memo,
        access.member.id,
        access.actor,
        access.actor,
        now,
        now
      )
      .first<PlaceRow>();
    await logTeamHistory({
      workspaceId: access.workspace.id,
      entityType: "place",
      entityId: row?.id ?? null,
      action: "create",
      summary: `${access.actor}님이 지도에 장소 ${describe(value)}을 등록함`,
      actor: access.actor,
    });
    return Response.json({ place: row ? toPlace(row) : null }, { status: 201 });
  } catch (error) {
    return routeError(error);
  }
}

export async function PATCH(request: Request) {
  try {
    await prepareTeamTables();
    const payload = await readPayload(request);
    const access = await requireWorkspaceAccess(request, payload as { workspaceId?: unknown });
    if ("response" in access) {
      return access.response;
    }
    const current = await findPlace(access.workspace.id, payload.id);
    if (!current) {
      return Response.json({ error: "장소를 찾을 수 없습니다." }, { status: 404 });
    }
    const denied = editDenied(access, current);
    if (denied) {
      return denied;
    }
    const input = normalizePlaceInput({ ...toPlace(current), ...payload });
    if ("error" in input) {
      return Response.json({ error: input.error }, { status: 400 });
    }
    const value = input.value;
    const row = await getD1()
      .prepare(
        `UPDATE map_places
         SET name = ?, kind = ?, custom_kind = ?, lat = ?, lng = ?, address = ?, memo = ?, updated_by = ?, updated_at = ?
         WHERE workspace_id = ? AND id = ?
         RETURNING *`
      )
      .bind(
        value.name,
        value.kind,
        value.customKind,
        value.lat,
        value.lng,
        value.address,
        value.memo,
        access.actor,
        new Date().toISOString(),
        access.workspace.id,
        current.id
      )
      .first<PlaceRow>();
    const moved = value.lat !== current.lat || value.lng !== current.lng;
    await logTeamHistory({
      workspaceId: access.workspace.id,
      entityType: "place",
      entityId: current.id,
      action: "update",
      summary: `${access.actor}님이 지도 장소 ${describe(value)}${moved ? "의 위치를" : "을"} 수정함`,
      actor: access.actor,
    });
    return Response.json({ place: row ? toPlace(row) : null });
  } catch (error) {
    return routeError(error);
  }
}

export async function DELETE(request: Request) {
  try {
    await prepareTeamTables();
    const payload = await readPayload(request);
    const access = await requireWorkspaceAccess(request, payload as { workspaceId?: unknown });
    if ("response" in access) {
      return access.response;
    }
    const current = await findPlace(access.workspace.id, payload.id);
    if (!current) {
      return Response.json({ error: "장소를 찾을 수 없습니다." }, { status: 404 });
    }
    const denied = editDenied(access, current);
    if (denied) {
      return denied;
    }
    await getD1()
      .prepare("DELETE FROM map_places WHERE workspace_id = ? AND id = ?")
      .bind(access.workspace.id, current.id)
      .run();
    await logTeamHistory({
      workspaceId: access.workspace.id,
      entityType: "place",
      entityId: current.id,
      action: "delete",
      summary: `${access.actor}님이 지도 장소 ${describe(toPlace(current))}을 삭제함`,
      actor: access.actor,
    });
    return Response.json({ place: null });
  } catch (error) {
    return routeError(error);
  }
}

import { getD1 } from "../../../db";
import { MAX_AREAS_PER_IMPORT, normalizeAreaInput, type MapArea } from "../../lib/areas";
import { formatArea, type AreaGeometry } from "../../lib/geo";
import { forbidden, requireWorkspaceAccess, type BoardAccess } from "../auth-store";
import { logTeamHistory, prepareTeamTables, routeError } from "../team-store";

// 구역 (polygons) on the board map: drawn or imported from Shapefiles. Every
// member sees them and may add; the person who added one or a 부서장 may
// change or delete it. Area and perimeter are always computed here.

type AreaRow = {
  id: number;
  workspace_id: string;
  name: string;
  color: string;
  memo: string;
  geometry: string;
  area_m2: number;
  perimeter_m: number;
  source: string;
  created_by_member_id: number;
  created_by_name: string;
  updated_by: string;
  created_at: string;
  updated_at: string;
};

function toArea(row: AreaRow): MapArea {
  return {
    id: row.id,
    name: row.name,
    color: row.color,
    memo: row.memo,
    geometry: JSON.parse(row.geometry) as AreaGeometry,
    areaM2: row.area_m2,
    perimeterM: row.perimeter_m,
    source: row.source === "shp" ? "shp" : "draw",
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

async function findArea(workspaceId: string, id: unknown) {
  const areaId = Number(id);
  if (!Number.isInteger(areaId)) {
    return null;
  }
  return await getD1().prepare("SELECT * FROM map_areas WHERE workspace_id = ? AND id = ?").bind(workspaceId, areaId).first<AreaRow>();
}

function editDenied(access: BoardAccess, row: AreaRow) {
  return access.isManager || row.created_by_member_id === access.member.id
    ? null
    : forbidden("구역은 등록한 사람 또는 부서장만 수정·삭제할 수 있습니다.");
}

const INSERT = `INSERT INTO map_areas
  (workspace_id, name, color, memo, geometry, area_m2, perimeter_m, source, created_by_member_id, created_by_name, updated_by, created_at, updated_at)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING *`;

export async function GET(request: Request) {
  try {
    await prepareTeamTables();
    const access = await requireWorkspaceAccess(request);
    if ("response" in access) {
      return access.response;
    }
    const rows = await getD1()
      .prepare("SELECT * FROM map_areas WHERE workspace_id = ? ORDER BY name, id LIMIT 2000")
      .bind(access.workspace.id)
      .all<AreaRow>();
    return Response.json({ areas: (rows.results ?? []).map(toArea) });
  } catch (error) {
    return routeError(error);
  }
}

/** One 구역 ({name, geometry, …}) or many from a Shapefile ({areas: [...]}). */
export async function POST(request: Request) {
  try {
    await prepareTeamTables();
    const payload = await readPayload(request);
    const access = await requireWorkspaceAccess(request, payload as { workspaceId?: unknown });
    if ("response" in access) {
      return access.response;
    }
    const raws = Array.isArray(payload.areas) ? (payload.areas as Record<string, unknown>[]) : [payload];
    if (!raws.length) {
      return Response.json({ error: "저장할 구역이 없습니다." }, { status: 400 });
    }
    if (raws.length > MAX_AREAS_PER_IMPORT) {
      return Response.json({ error: `한 번에 ${MAX_AREAS_PER_IMPORT}개까지 저장할 수 있습니다.` }, { status: 400 });
    }
    const inputs = [];
    for (const [index, raw] of raws.entries()) {
      const input = normalizeAreaInput(raw ?? {});
      if ("error" in input) {
        return Response.json({ error: raws.length > 1 ? `${index + 1}번째 구역: ${input.error}` : input.error }, { status: 400 });
      }
      inputs.push(input.value);
    }
    const now = new Date().toISOString();
    const d1 = getD1();
    const results = await d1.batch(
      inputs.map((value) =>
        d1
          .prepare(INSERT)
          .bind(
            access.workspace.id,
            value.name,
            value.color,
            value.memo,
            JSON.stringify(value.geometry),
            value.areaM2,
            value.perimeterM,
            value.source,
            access.member.id,
            access.actor,
            access.actor,
            now,
            now
          )
      )
    );
    const areas = results.flatMap((result) => ((result.results ?? []) as AreaRow[]).map(toArea));
    const total = inputs.reduce((sum, value) => sum + value.areaM2, 0);
    await logTeamHistory({
      workspaceId: access.workspace.id,
      entityType: "area",
      entityId: areas.length === 1 ? areas[0].id : null,
      action: "create",
      summary:
        inputs.length === 1
          ? `${access.actor}님이 지도에 구역 '${inputs[0].name}'(${formatArea(inputs[0].areaM2).split(" · ")[0]})을 ${inputs[0].source === "shp" ? "SHP에서 가져옴" : "그림"}`
          : `${access.actor}님이 SHP에서 구역 ${inputs.length}개(합계 ${formatArea(total).split(" · ")[0]})를 가져옴`,
      actor: access.actor,
    });
    return Response.json({ areas, area: areas[0] ?? null, created: areas.length }, { status: 201 });
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
    const current = await findArea(access.workspace.id, payload.id);
    if (!current) {
      return Response.json({ error: "구역을 찾을 수 없습니다." }, { status: 404 });
    }
    const denied = editDenied(access, current);
    if (denied) {
      return denied;
    }
    const input = normalizeAreaInput({ ...toArea(current), ...payload });
    if ("error" in input) {
      return Response.json({ error: input.error }, { status: 400 });
    }
    const value = input.value;
    const row = await getD1()
      .prepare(
        `UPDATE map_areas SET name = ?, color = ?, memo = ?, geometry = ?, area_m2 = ?, perimeter_m = ?, updated_by = ?, updated_at = ?
         WHERE workspace_id = ? AND id = ? RETURNING *`
      )
      .bind(
        value.name,
        value.color,
        value.memo,
        JSON.stringify(value.geometry),
        value.areaM2,
        value.perimeterM,
        access.actor,
        new Date().toISOString(),
        access.workspace.id,
        current.id
      )
      .first<AreaRow>();
    await logTeamHistory({
      workspaceId: access.workspace.id,
      entityType: "area",
      entityId: current.id,
      action: "update",
      summary: `${access.actor}님이 지도 구역 '${value.name}'을 수정함`,
      actor: access.actor,
    });
    return Response.json({ area: row ? toArea(row) : null });
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
    const current = await findArea(access.workspace.id, payload.id);
    if (!current) {
      return Response.json({ error: "구역을 찾을 수 없습니다." }, { status: 404 });
    }
    const denied = editDenied(access, current);
    if (denied) {
      return denied;
    }
    await getD1().prepare("DELETE FROM map_areas WHERE workspace_id = ? AND id = ?").bind(access.workspace.id, current.id).run();
    await logTeamHistory({
      workspaceId: access.workspace.id,
      entityType: "area",
      entityId: current.id,
      action: "delete",
      summary: `${access.actor}님이 지도 구역 '${current.name}'을 삭제함`,
      actor: access.actor,
    });
    return Response.json({ area: null });
  } catch (error) {
    return routeError(error);
  }
}

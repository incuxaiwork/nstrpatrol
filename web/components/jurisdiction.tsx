"use client";

/**
 * Jurisdiction UI primitives — visual distinction between a ranger's NORMAL
 * JURISDICTION and SPECIAL AUTHORIZED AREAS (PRD §11, §16). Used across the
 * patrol pages, patrol details and the patrol permissions workspace.
 */

import { Badge, Card, CardHeader } from "@/components/ui";
import { Icon } from "@/components/icons";
import { mapBeatsRaw } from "@/lib/mock/gis";
import { unitName } from "@/lib/mock/hierarchy";
import { authStatusLabel, authStatusTone, jurisdictionLabel, jurisdictionTone } from "@/lib/jurisdiction";
import type { JurisdictionState, PatrolAuthorization } from "@/lib/types";

/* ------------------------------------------------------------------ */
/* Compact badge for table rows                                       */
/* ------------------------------------------------------------------ */

export function JurisdictionBadge({ state }: { state: JurisdictionState }) {
  return (
    <Badge tone={jurisdictionTone[state]} dot>
      {state === "normal"
        ? "Normal"
        : state === "authorized-exception"
          ? "Authorized exception"
          : state === "pending-review"
            ? "Pending review"
            : "Requires review"}
    </Badge>
  );
}

/* ------------------------------------------------------------------ */
/* Highly visible banner for patrol details                           */
/* ------------------------------------------------------------------ */

export function JurisdictionBanner({
  state,
  authorization,
  homeArea,
  patrolArea,
}: {
  state: JurisdictionState;
  authorization?: PatrolAuthorization;
  homeArea?: string;
  patrolArea: string;
}) {
  if (state === "normal") {
    return (
      <div className="flex items-start gap-3 rounded-card border border-forest-200 bg-forest-50 px-4 py-3">
        <Icon name="check" size={16} className="mt-0.5 shrink-0 text-forest-700" />
        <div>
          <p className="text-sm font-medium text-forest-900">Within normal jurisdiction</p>
          <p className="mt-0.5 text-xs text-forest-700">
            Patrol area {patrolArea} falls inside the ranger&apos;s home jurisdiction.
          </p>
        </div>
      </div>
    );
  }

  const tone = state === "authorized-exception" ? "info" : state === "pending-review" ? "warning" : "danger";
  const border =
    tone === "info" ? "border-info/30 bg-info-soft" : tone === "warning" ? "border-warning/30 bg-warning-soft" : "border-danger/30 bg-danger-soft";
  const text = tone === "info" ? "text-info" : tone === "warning" ? "text-[#8a4b00]" : "text-danger";

  return (
    <div className={`flex items-start gap-3 rounded-card border px-4 py-3 ${border}`}>
      <Icon name="alert" size={16} className={`mt-0.5 shrink-0 ${text}`} />
      <div className="min-w-0 flex-1">
        <p className={`text-sm font-medium ${text}`}>⚠ {jurisdictionLabel[state]}</p>
        <p className="mt-0.5 text-xs text-ink-soft">
          {homeArea ? `Home: ${homeArea}` : "Home jurisdiction unknown"} · Actual: {patrolArea}
        </p>
        {authorization ? (
          <div className="mt-2 grid gap-x-6 gap-y-1 text-xs sm:grid-cols-2 lg:grid-cols-4">
            <span className="font-medium text-ink">
              Authorization: <span className="font-mono text-forest-800">{authorization.id}</span>
            </span>
            <span className="text-ink-soft">
              Status: <Badge tone={authStatusTone[authorization.status]}>{authStatusLabel[authorization.status]}</Badge>
            </span>
            <span className="text-ink-soft">Approved by: {authorization.approvedBy ?? "—"}</span>
            <span className="text-ink-soft">
              Valid until: {authorization.validUntil ? new Date(authorization.validUntil).toLocaleDateString() : "—"}
            </span>
          </div>
        ) : (
          <p className="mt-1 text-xs text-ink-soft">
            Authorization not found — this patrol requires administrative review.
          </p>
        )}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Beat map visualizing normal vs authorized area (SVG, mock GIS)     */
/* ------------------------------------------------------------------ */

function centroid(points: string): { x: number; y: number } {
  const pts = points.split(" ").map((p) => p.split(",").map(Number));
  return {
    x: pts.reduce((a, p) => a + p[0], 0) / pts.length,
    y: pts.reduce((a, p) => a + p[1], 0) / pts.length,
  };
}

export function AuthAreaMap({
  homeIds = [],
  authIds = [],
  selectedId,
  onSelect,
  heightClass = "h-64",
}: {
  homeIds?: string[];
  authIds?: string[];
  selectedId?: string;
  onSelect?: (id: string | null) => void;
  heightClass?: string;
}) {
  return (
    <div className="overflow-hidden rounded-card border border-line bg-[#eef1ea]">
      <svg viewBox="0 0 1000 910" className={`w-full ${heightClass}`} preserveAspectRatio="xMidYMid meet" role="img" aria-label="Jurisdiction map — normal versus authorized beats">
        <rect x="0" y="0" width="1000" height="910" fill="#eef1ea" />
        <path d="M0 60 C 200 90, 260 40, 470 110 S 760 40, 1000 90 L 1000 0 L 0 0 Z" fill="#d8e2d4" />
        <path d="M0 700 C 220 640, 380 720, 600 660 S 860 620, 1000 660 L 1000 700 Z" fill="#d4dde4" />
        {mapBeatsRaw.map((b) => {
          const isHome = homeIds.includes(b.id);
          const isAuth = authIds.includes(b.id);
          const isSelected = selectedId === b.id;
          const c = centroid(b.points);
          const fill = isHome
            ? "#1F4626"
            : isAuth
              ? "#F4B942"
              : isSelected
                ? "#dceadc"
                : "#f4f6f2";
          const stroke = isHome ? "#0f2e18" : isAuth ? "#b07d12" : isSelected ? "#1F4626" : "#9db0a0";
          return (
            <g key={b.id} onClick={() => onSelect?.(isSelected ? null : b.id)} className={onSelect ? "cursor-pointer" : undefined}>
              <polygon points={b.points} fill={fill} stroke={stroke} strokeWidth={isHome || isAuth || isSelected ? 2.5 : 1.2} opacity={isHome || isAuth ? 0.92 : 1} />
              <text x={c.x} y={c.y} textAnchor="middle" fontSize="16" fontWeight="700"
                fill={isHome ? "#fff" : isAuth ? "#5b3d05" : "#4a5d4f"}>
                {b.name}
              </text>
            </g>
          );
        })}
      </svg>
      <div className="flex flex-wrap gap-x-4 gap-y-1 border-t border-line bg-white px-3 py-2 text-[11px] text-ink-soft">
        <span className="inline-flex items-center gap-1.5">
          <span className="size-2.5 rounded-sm bg-[#1F4626]" /> Normal jurisdiction
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="size-2.5 rounded-sm bg-[#F4B942]" /> Authorized area
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="size-2.5 rounded-sm bg-[#f4f6f2] ring-1 ring-[#9db0a0]" /> Beat
        </span>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Area comparison card (home vs authorized)                          */
/* ------------------------------------------------------------------ */

export function JurisdictionCompareCard({ authorization }: { authorization: PatrolAuthorization }) {
  const rows = [
    { label: "Division", home: authorization.homeDivision, auth: authorization.authDivision },
    { label: "Range", home: authorization.homeRange, auth: authorization.authRange },
    { label: "Beat", home: authorization.homeBeat, auth: authorization.authBeat },
  ];
  return (
    <Card>
      <CardHeader title="Normal vs authorized area" icon="map" subtitle="Where the ranger usually patrols, versus where they may patrol" />
      <div className="p-4">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-ink-soft">
              <th className="pb-2 pr-4 font-medium">Unit</th>
              <th className="pb-2 pr-4 font-medium">Normal jurisdiction</th>
              <th className="pb-2 font-medium">Authorized area</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.label} className="border-t border-line">
                <td className="py-2 pr-4 text-xs font-medium text-ink-soft">{r.label}</td>
                <td className="py-2 pr-4 font-medium text-ink">{unitName(r.home)}</td>
                <td className="py-2 font-medium text-[#8a4b00]">{unitName(r.auth)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

/**
 * Jurisdiction validation (PRD §6) — determines whether a patrol lies within
 * the ranger's normal jurisdiction, is covered by a special authorization,
 * or requires administrative review.
 */

import type { BadgeTone } from "@/components/ui";
import type {
  AuthorizationStatus,
  BeatJurisdiction,
  JurisdictionState,
  Patrol,
  PatrolAuthorization,
  Ranger,
} from "@/lib/types";

/** Minimal roster entry needed to resolve a ranger's home jurisdiction. */
export type RangerHomeRef = Pick<Ranger, "id" | "name" | "division" | "range" | "beat">;

export interface JurisdictionResolution {
  state: JurisdictionState;
  authorization?: PatrolAuthorization;
  homeDivision?: string;
  homeRange?: string;
  homeBeat?: string;
}

export const jurisdictionLabel: Record<JurisdictionState, string> = {
  normal: "Within normal jurisdiction",
  "authorized-exception": "Outside normal jurisdiction · Authorized",
  "pending-review": "Outside normal jurisdiction · Pending review",
  "requires-review": "Outside normal jurisdiction · Requires review",
  unknown: "Jurisdiction unknown · Ranger home not on record",
};

export const jurisdictionTone: Record<JurisdictionState, BadgeTone> = {
  normal: "forest",
  "authorized-exception": "info",
  "pending-review": "warning",
  "requires-review": "danger",
  // A data gap is NOT a violation — neutral presentation only.
  unknown: "neutral",
};

export const authStatusLabel: Record<AuthorizationStatus, string> = {
  draft: "Draft",
  pending: "Pending approval",
  active: "Active",
  expired: "Expired",
  revoked: "Revoked",
  completed: "Completed",
  rejected: "Rejected",
};

export const authStatusTone: Record<AuthorizationStatus, BadgeTone> = {
  draft: "neutral",
  pending: "warning",
  active: "success",
  expired: "neutral",
  revoked: "danger",
  completed: "forest",
  rejected: "danger",
};

/**
 * Home jurisdiction of a ranger, resolved from a REAL roster passed in by the
 * caller (users API records). Mock rosters must never drive jurisdiction
 * evaluation — when no roster is provided or no entry matches, the home is
 * simply unresolved (undefined), never guessed.
 */
export function rangerHome(
  patrol: Patrol,
  roster: RangerHomeRef[] = []
): { division: string; range: string; beat: string } | undefined {
  const ranger = roster.find((r) => r.id === patrol.rangerId || r.name === patrol.leader);
  if (!ranger) return undefined;
  // A home only counts when the roster actually carries geography.
  if (!ranger.division && !ranger.range && !ranger.beat) return undefined;
  return { division: ranger.division, range: ranger.range, beat: ranger.beat };
}

/**
 * Jurisdiction foundation (PRD §16) — frontend data/context only.
 *
 * Resolves the beat a ranger normally patrols from whatever the data source
 * provides: `assignedBeatId` when the backend exposes explicit beat
 * assignments, otherwise the ranger's home beat field. Absence of both yields
 * a jurisdiction record with no beat — never a guessed value. No enforcement
 * happens here (final RBAC / permissions are deferred).
 */
export function rangerJurisdiction(ranger: Pick<Ranger, "id" | "name" | "division" | "range" | "beat" | "assignedBeatId"> | undefined): BeatJurisdiction {
  if (!ranger) return { rangerId: "" };
  return {
    rangerId: ranger.id,
    rangerName: ranger.name,
    divisionId: ranger.division || undefined,
    rangeId: ranger.range || undefined,
    beatId: ranger.assignedBeatId || ranger.beat || undefined,
    assignedBeatId: ranger.assignedBeatId || undefined,
  };
}

/** Does the authorization's area match a patrol area exactly (division/range/beat)? */
export function authorizationCovers(
  auth: PatrolAuthorization,
  division: string,
  range: string,
  beat: string
): boolean {
  return (
    auth.authDivision === division &&
    auth.authRange === range &&
    auth.authBeat === beat
  );
}

/**
 * Classify a patrol's jurisdiction status.
 *
 * normal            — patrol inside the ranger's home division/range/beat.
 * authorized        — outside home area but covered by an ACTIVE authorization.
 * pending-review    — outside home area with a matching authorization still in
 *                     draft/pending state (flagged for confirmation).
 * requires-review   — outside home area with no effective authorization.
 * unknown           — the ranger's home could not be resolved from real
 *                     roster data (no match / no geography). A neutral data
 *                     gap — never reported as a cross-jurisdiction violation.
 */
export function resolveJurisdiction(
  patrol: Patrol,
  authorizations: PatrolAuthorization[],
  roster: RangerHomeRef[] = []
): JurisdictionResolution {
  const home = rangerHome(patrol, roster);

  // Without a resolvable home there is nothing to validate against — report
  // the data gap honestly instead of alleging a violation.
  if (!home) return { state: "unknown" };

  const inHome =
    home.division === patrol.division &&
    home.range === patrol.range &&
    home.beat === patrol.beat;
  if (inHome) return { state: "normal", ...home };

  const auth = authorizations.find((a) => a.id === patrol.authorizationId);
  if (!auth) {
    return { state: "requires-review", homeDivision: home.division, homeRange: home.range, homeBeat: home.beat };
  }
  const covers = authorizationCovers(auth, patrol.division, patrol.range, patrol.beat);
  if (covers && auth.status === "active") {
    return { state: "authorized-exception", authorization: auth, ...home };
  }
  if (covers && (auth.status === "draft" || auth.status === "pending")) {
    return { state: "pending-review", authorization: auth, ...home };
  }
  return { state: "requires-review", authorization: auth, ...home };
}

/** Patrols recorded under a given authorization (PRD §18 — Related Patrols). */
export function patrolsUnderAuthorization(
  authorizationId: string,
  patrols: Patrol[]
): Patrol[] {
  return patrols.filter((p) => p.authorizationId === authorizationId);
}

/** Short beat label helper used across permission surfaces. */
export function areaLabel(division: string, range: string, beat: string): string {
  const short = (id: string) => id.split("-").pop()?.toUpperCase() ?? id;
  return `${short(division)} / ${short(range)} / ${short(beat)}`;
}

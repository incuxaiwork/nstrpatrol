/**
 * Jurisdiction validation (PRD §6) — determines whether a patrol lies within
 * the ranger's normal jurisdiction, is covered by a special authorization,
 * or requires administrative review.
 */

import type { BadgeTone } from "@/components/ui";
import { mockRangers } from "@/lib/mock/people";
import type {
  AuthorizationStatus,
  JurisdictionState,
  Patrol,
  PatrolAuthorization,
} from "@/lib/types";

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
};

export const jurisdictionTone: Record<JurisdictionState, BadgeTone> = {
  normal: "forest",
  "authorized-exception": "info",
  "pending-review": "warning",
  "requires-review": "danger",
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

/** Home jurisdiction of a ranger, resolved from the ranger record. */
export function rangerHome(
  patrol: Patrol
): { division: string; range: string; beat: string } | undefined {
  const ranger = mockRangers.find((r) => r.id === patrol.rangerId || r.name === patrol.leader);
  if (!ranger) return undefined;
  return { division: ranger.division, range: ranger.range, beat: ranger.beat };
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
 */
export function resolveJurisdiction(
  patrol: Patrol,
  authorizations: PatrolAuthorization[]
): JurisdictionResolution {
  const home = rangerHome(patrol);
  const inHome =
    !!home &&
    home.division === patrol.division &&
    home.range === patrol.range &&
    home.beat === patrol.beat;
  if (inHome) return { state: "normal", ...(home ? { ...home } : {}) };

  const auth = authorizations.find((a) => a.id === patrol.authorizationId);
  if (!auth) {
    return {
      state: "requires-review",
      ...(home ? { homeDivision: home.division, homeRange: home.range, homeBeat: home.beat } : {}),
    };
  }
  const covers = authorizationCovers(auth, patrol.division, patrol.range, patrol.beat);
  if (covers && auth.status === "active") {
    return { state: "authorized-exception", authorization: auth, ...(home ? { ...home } : {}) };
  }
  if (covers && (auth.status === "draft" || auth.status === "pending")) {
    return { state: "pending-review", authorization: auth, ...(home ? { ...home } : {}) };
  }
  return { state: "requires-review", authorization: auth, ...(home ? { ...home } : {}) };
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

"use client";

/**
 * Create Authorization (PRD §6.15) — multi-step wizard for granting a ranger
 * a special patrol authorization outside their normal jurisdiction.
 *
 * STEP 1  Select ranger (shows normal jurisdiction)
 * STEP 2  Select authorized area (GIS visualization)
 * STEP 3  Authorization details (reason, instruction, validity, restrictions)
 * STEP 4  Review
 * STEP 5  Approve / publish (or save as draft)
 *
 * Super Admin / authorized senior officer only.
 */

import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { authorizations, rangers } from "@/lib/services";
import { useAsyncData } from "@/lib/use-async";
import { useApp } from "@/lib/store";
import { Card, CardHeader, Field, Input, Select, Textarea, Badge, PageHeader, type BadgeTone } from "@/components/ui";
import { Icon } from "@/components/icons";
import { AuthAreaMap } from "@/components/jurisdiction";
import { SkeletonRows, ErrorState } from "@/components/ui/loading";
import { dutyStatusLabel, dutyStatusTone } from "@/lib/nav";
import { patrolTypeLabels } from "@/lib/mock/patrols";
import { mockBeats, mockDivisions, mockRanges, unitName } from "@/lib/mock/hierarchy";
import { mapBeatsRaw } from "@/lib/mock/gis";
import type { PatrolType } from "@/lib/types";

const APPROVER = "V. Kulkarni · Super Admin";
const STEP_LABELS = ["Select ranger", "Select area", "Details", "Review", "Approval"];

export default function CreateAuthorizationPage() {
  return (
    <Suspense fallback={<SkeletonRows rows={6} />}>
      <CreateAuthorizationWizard />
    </Suspense>
  );
}

function CreateAuthorizationWizard() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const editId = searchParams.get("edit");
  const { pushToast } = useApp();
  const roster = useAsyncData(() => rangers.list(), [], { cacheKey: "rangers:list" });
  const editing = useAsyncData(() => (editId ? authorizations.get(editId) : Promise.resolve(undefined)));

  const draft = editId ? editing.data : undefined;
  // New authorizations start at STEP 1 (Select Ranger); only when EDITING an
  // existing record do we resume at the step matching its status (draft → 1,
  // otherwise → 3). Previously a brand-new wizard (no draft) evaluated to 3
  // and skipped Ranger + Area selection.
  const draftStep = editId ? (draft?.status === "draft" ? 1 : 3) : 1;

  const [step, setStep] = useState(draftStep);
  // Highest step the user has reached/validated, so the step pills can jump
  // directly to any earlier completed step instead of the wizard forcing a
  // linear re-walk (#5).
  const [maxCompletedStep, setMaxCompletedStep] = useState(draftStep);
  const [rangerId, setRangerId] = useState(draft?.rangerId ?? "");
  const [authDivision, setAuthDivision] = useState(draft?.authDivision ?? "");
  const [authRange, setAuthRange] = useState(draft?.authRange ?? "");
  const [authBeat, setAuthBeat] = useState(draft?.authBeat ?? "");
  const [reason, setReason] = useState(draft?.reason ?? "");
  const [instruction, setInstruction] = useState(draft?.instruction ?? "");
  const [patrolType, setPatrolType] = useState<PatrolType>(draft?.patrolType ?? "general-duties");
  const [objective, setObjective] = useState(draft?.objective ?? "");
  const [validFrom, setValidFrom] = useState(() => dateInput(new Date(draft?.validFrom ?? Date.now() + 86_400_000)));
  const [validUntil, setValidUntil] = useState(() => dateInput(new Date(draft?.validUntil ?? Date.now() + 14 * 86_400_000)));
  const [priority, setPriority] = useState<"low" | "medium" | "high" | "critical">(draft?.priority ?? "medium");
  const [restrictions, setRestrictions] = useState(draft?.restrictions ?? "");
  const [notes, setNotes] = useState(draft?.notes ?? "");

  // Hydrate the form once the async `editing.data` resolves — the initial
  // state above is seeded from `draft` which is undefined while loading, so a
  // resumed draft (?edit=AUTH-...) would otherwise keep every field blank (#7).
  useEffect(() => {
    if (!editing.data) return;
    setRangerId(editing.data.rangerId ?? "");
    setAuthDivision(editing.data.authDivision ?? "");
    setAuthRange(editing.data.authRange ?? "");
    setAuthBeat(editing.data.authBeat ?? "");
    setReason(editing.data.reason ?? "");
    setInstruction(editing.data.instruction ?? "");
    if (editing.data.patrolType) setPatrolType(editing.data.patrolType);
    setObjective(editing.data.objective ?? "");
    if (editing.data.validFrom) setValidFrom(dateInput(new Date(editing.data.validFrom)));
    if (editing.data.validUntil) setValidUntil(dateInput(new Date(editing.data.validUntil)));
    if (editing.data.priority) setPriority(editing.data.priority);
    setRestrictions(editing.data.restrictions ?? "");
    setNotes(editing.data.notes ?? "");
  }, [editing.data]);

  // Guard: if a step beyond Step 1 has no ranger selected, push back so the
  // review/detail steps can never open blank (#4). Skipped while an existing
  // draft is still hydrating (editing.loading) — the saved ranger is about to
  // repopulate, so forcing Step 1 would bounce an edit away from its resume step.
  useEffect(() => {
    if (editing.loading) return;
    if (step > 1 && !rangerId) {
      setStep(1);
      setMaxCompletedStep((m) => Math.max(m, 1));
    }
  }, [step, rangerId, editId, editing.loading]);

  const ranger = roster.data?.find((r) => r.id === rangerId);

  const authRangeOptions = authDivision ? (mockRanges[authDivision] ?? []) : [];
  const authBeatOptions = authRange ? (mockBeats[authRange] ?? []) : [];

  const homeIds = ranger ? [ranger.beat] : [];
  const authIds = authBeat ? [authBeat] : [];

  const step2Valid = authDivision && authRange && authBeat;

  const fromTime = new Date(validFrom).getTime();
  const untilTime = new Date(validUntil).getTime();
  const detailsErrors = {
    reason: reason.trim().length < 5 ? "Enter a reason (at least 5 characters)" : undefined,
    instruction: instruction.trim().length < 5 ? "Enter an operational instruction (at least 5 characters)" : undefined,
    validity:
      !validFrom || !validUntil
        ? "Set both validity dates"
        : Number.isNaN(fromTime) || Number.isNaN(untilTime)
          ? "Enter valid dates"
          : untilTime <= fromTime
            ? "Valid until must be after valid from"
            : undefined,
  };
  const step3Valid = !detailsErrors.reason && !detailsErrors.instruction && !detailsErrors.validity;

  const setFrom = (v: string) => {
    setValidFrom(v);
    if (v && validUntil && new Date(v).getTime() >= new Date(validUntil).getTime()) {
      setValidUntil(dateInput(new Date(new Date(v).getTime() + 86_400_000)));
    }
  };

  if (roster.loading || !roster.data || editing.loading) return <SkeletonRows rows={7} />;
  if (roster.error) return <ErrorState message={roster.error.message} onRetry={roster.reload} />;
  if (editing.error) return <ErrorState message={editing.error.message} onRetry={editing.reload} />;

  const submit = async (status: "active" | "draft") => {
    // Approving requires a ranger; saving a draft is allowed on any step and
    // does not demand a fully-formed record (#6).
    if (status === "active" && !ranger) {
      pushToast("error", "Cannot approve yet", "Select a ranger and complete the authorization first.");
      return;
    }
    const payload = {
      rangerId,
      homeDivision: ranger?.division ?? "",
      homeRange: ranger?.range ?? "",
      homeBeat: ranger?.beat ?? "",
      authDivision,
      authRange,
      authBeat,
      reason,
      instruction,
      patrolType,
      objective: objective || undefined,
      validFrom,
      validUntil,
      priority,
      restrictions: restrictions || undefined,
      notes: notes || undefined,
    };
    if (editId && editing.data) {
      await authorizations.update(
        editId,
        status === "active"
          ? {
              ...payload,
              status,
              approvedBy: APPROVER,
              approvalDate: new Date().toISOString(),
            }
          : payload
      );
      pushToast(
        status === "active" ? "success" : "info",
        status === "active" ? "Authorization approved" : "Draft updated",
        `${editId} ${status === "active" ? "is now active" : "updated"}`
      );
      router.push(`/patrols/permissions/${editId}`);
      return;
    }
    const auth = await authorizations.create({ ...payload, status });
    pushToast(
      status === "active" ? "success" : "info",
      status === "active" ? "Authorization approved" : "Draft saved",
      `${auth.id} ${status === "active" ? "is now active" : "saved as draft"}`
    );
    router.push(`/patrols/permissions/${auth.id}`);
  };

  const authArea =
    authDivision && authRange && authBeat
      ? `${unitName(authDivision)} / ${unitName(authRange)} / ${unitName(authBeat)}`
      : "—";

  return (
    <div>
      <PageHeader
        title={editId ? "Edit Authorization" : "Create Authorization"}
        subtitle={editId ? `Amend draft ${editId} and continue the approval flow` : "Grant a ranger special permission to patrol outside their normal jurisdiction"}
        actions={
          editId && editing.data ? (
            <Badge tone={editing.data.status === "draft" ? "neutral" : "info"}>
              {editing.data.status === "draft" ? "Draft — editable" : editing.data.status}
            </Badge>
          ) : (
            <Badge tone="neutral">{STEP_LABELS[step - 1]}</Badge>
          )
        }
      />

      {/* Step indicator — any previously-visited step may be reopened directly (#5) */}
      <div className="flex items-center gap-2 overflow-x-auto pb-1">
        {STEP_LABELS.map((label, i) => {
          const idx = i + 1;
          const reachable = idx <= maxCompletedStep || idx === step;
          return (
            <button
              key={label}
              onClick={() => reachable && setStep(idx)}
              disabled={!reachable}
              className={[
                "inline-flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-colors",
                step === idx
                  ? "border-forest-700 bg-forest-800 text-white"
                  : reachable
                    ? "border-forest-200 bg-forest-50 text-forest-800 hover:border-forest-600"
                    : "border-line bg-white text-ink-faint",
              ].join(" ")}
            >
              <span className="flex size-4 items-center justify-center rounded-full text-[10px] font-bold">
                {idx < maxCompletedStep ? "✓" : idx}
              </span>
              {label}
            </button>
          );
        })}
      </div>

      <div className="mt-4">
        {step === 1 && (
          <Card>
            <div className="grid gap-3 p-4 sm:grid-cols-2 xl:grid-cols-3">
              {roster.data.map((r) => {
                const selected = rangerId === r.id;
                return (
                  <button
                    key={r.id}
                    onClick={() => setRangerId(r.id)}
                    className={[
                      "rounded-card border p-3 text-left transition-colors",
                      selected ? "border-forest-700 bg-forest-50 ring-1 ring-forest-700" : "border-line bg-surface hover:border-forest-600 hover:bg-forest-50",
                    ].join(" ")}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <p className="font-medium text-ink">{r.name}</p>
                      {selected && <Icon name="check" size={14} className="text-forest-700" />}
                    </div>
                    <p className="mt-0.5 text-xs text-ink-soft">{r.code} · {r.designation}</p>
                    <p className="mt-1.5 text-xs text-ink-soft">
                      Normal jurisdiction: <span className="font-medium text-ink">{unitName(r.division)} / {unitName(r.range)} / {unitName(r.beat)}</span>
                    </p>
                    <p className="mt-1"><Badge tone={dutyStatusTone[r.dutyStatus]} dot>{dutyStatusLabel[r.dutyStatus]}</Badge></p>
                  </button>
                );
              })}
            </div>
          </Card>
        )}

        {step === 2 && (
          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <div className="p-4">
                <AuthAreaMap
                  homeIds={homeIds}
                  authIds={authIds}
                  selectedId={authBeat}
                  onSelect={(id) => {
                    if (!id) { setAuthBeat(""); return; }
                    const beat = mapBeatsRaw.find((b) => b.id === id);
                    if (beat) {
                      setAuthDivision(beat.division);
                      setAuthRange(beat.range);
                      setAuthBeat(beat.id);
                    }
                  }}
                  heightClass="h-[420px]"
                />
              </div>
            </Card>
            <div className="space-y-4">
              <Card>
                <CardHeader title="Authorized area" icon="map" subtitle="Where the ranger may patrol under this authorization" />
                <div className="grid gap-4 p-4">
                  <Field label="Division" required>
                    <Select value={authDivision} onChange={(e) => { setAuthDivision(e.target.value); setAuthRange(""); setAuthBeat(""); }}>
                      <option value="">Select division…</option>
                      {mockDivisions.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
                    </Select>
                  </Field>
                  <Field label="Range" required>
                    <Select value={authRange} onChange={(e) => { setAuthRange(e.target.value); setAuthBeat(""); }} disabled={!authDivision}>
                      <option value="">Select range…</option>
                      {authRangeOptions.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
                    </Select>
                  </Field>
                  <Field label="Beat" required hint="Click a beat on the map or pick from the list">
                    <Select value={authBeat} onChange={(e) => setAuthBeat(e.target.value)} disabled={!authRange}>
                      <option value="">Select beat…</option>
                      {authBeatOptions.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
                    </Select>
                  </Field>
                  {ranger && (
                    <div className="rounded-card border border-line bg-surface p-3 text-xs text-ink-soft">
                      <p><span className="font-medium text-ink">Home jurisdiction:</span> {unitName(ranger.division)} / {unitName(ranger.range)} / {unitName(ranger.beat)}</p>
                      {authDivision && authRange && authBeat && (
                        <p className="mt-1">
                          {authDivision === ranger.division && authRange === ranger.range && authBeat === ranger.beat ? (
                            <span className="font-medium text-warning">Same as home jurisdiction — a special authorization is not required for this area.</span>
                          ) : (
                            <span className="font-medium text-info">Outside home jurisdiction — authorization required. ✓</span>
                          )}
                        </p>
                      )}
                    </div>
                  )}
                </div>
              </Card>
            </div>
          </div>
        )}

        {step === 3 && (
          <Card>
            <div className="grid gap-4 p-5 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <Field label="Reason" required error={detailsErrors.reason} hint="Operational justification for the exception">
                  <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Census support — beat Guttalachenu needs extra foot teams" />
                </Field>
              </div>
              <div className="sm:col-span-2">
                <Field label="Operational instruction" required error={detailsErrors.instruction}>
                  <Textarea value={instruction} onChange={(e) => setInstruction(e.target.value)} rows={3} placeholder="e.g. Report to Guttalachenu guard post; join census transect 3; follow census supervisor direction" />
                </Field>
              </div>
              <Field label="Patrol type" required>
                <Select value={patrolType} onChange={(e) => setPatrolType(e.target.value as PatrolType)}>
                  {Object.entries(patrolTypeLabels).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                </Select>
              </Field>
              <Field label="Operational objective" hint="Optional but recommended">
                <Input value={objective} onChange={(e) => setObjective(e.target.value)} placeholder="e.g. Assist one-horned rhino census count" />
              </Field>
              <Field label="Valid from" required error={detailsErrors.validity}>
                <Input type="datetime-local" value={validFrom} onChange={(e) => setFrom(e.target.value)} />
              </Field>
              <Field label="Valid until" required error={detailsErrors.validity}>
                <Input type="datetime-local" value={validUntil} onChange={(e) => setValidUntil(e.target.value)} />
              </Field>
              <Field label="Priority" required>
                <Select value={priority} onChange={(e) => setPriority(e.target.value as typeof priority)}>
                  <option value="low">Low</option>
                  <option value="medium">Medium</option>
                  <option value="high">High</option>
                  <option value="critical">Critical</option>
                </Select>
              </Field>
              <div className="sm:col-span-2">
                <Field label="Special restrictions" hint="Any conditions attached to the permission">
                  <Textarea value={restrictions} onChange={(e) => setRestrictions(e.target.value)} rows={2} placeholder="e.g. No off-trail movement outside transects; return before dusk" />
                </Field>
              </div>
              <div className="sm:col-span-2">
                <Field label="Notes" hint="Internal remarks visible to authorized officers">
                  <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} placeholder="e.g. Transport provided from range office" />
                </Field>
              </div>
            </div>
          </Card>
        )}

        {step === 4 &&
          (ranger ? (
          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader title="Review" icon="eye" subtitle="Confirm the authorization before approval" />
              <dl className="space-y-2.5 p-4 text-sm">
                <Row label="Ranger" value={`${ranger.name} · ${ranger.code}`} />
                <Row label="Normal jurisdiction" value={`${unitName(ranger.division)} / ${unitName(ranger.range)} / ${unitName(ranger.beat)}`} />
                <Row label="Authorized area" value={authArea} tone="warn" />
                <Row label="Reason" value={reason} />
                <Row label="Operational instruction" value={instruction} />
                <Row label="Patrol type" value={patrolTypeLabels[patrolType]} />
                {objective && <Row label="Objective" value={objective} />}
                <Row label="Validity" value={`${new Date(validFrom).toLocaleString()} → ${new Date(validUntil).toLocaleString()}`} />
                <Row label="Priority" value={<Badge tone={priorityTone[priority]}>{priority[0].toUpperCase() + priority.slice(1)}</Badge>} />
                {restrictions && <Row label="Restrictions" value={restrictions} />}
                <Row label="Approver" value={APPROVER} />
              </dl>
            </Card>
            <div className="space-y-4">
              <Card>
                <CardHeader title="Area preview" icon="map" />
                <div className="p-4">
                  <AuthAreaMap homeIds={homeIds} authIds={authIds} heightClass="h-72" />
                </div>
              </Card>
            </div>
          </div>
          ) : (
            <Card>
              <div className="p-6 text-center">
                <Icon name="users" size={28} className="mx-auto text-ink-faint" />
                <p className="mt-3 text-sm font-medium text-ink">No ranger selected</p>
                <p className="mx-auto mt-1 max-w-sm text-sm text-ink-soft">
                  Select a ranger on Step 1 before reviewing this authorization.
                </p>
                <button
                  onClick={() => setStep(1)}
                  className="mt-4 inline-flex h-9 items-center gap-1.5 rounded-field bg-forest-800 px-4 text-sm font-medium text-white shadow-card hover:bg-forest-700"
                >
                  <Icon name="chevronLeft" size={14} /> Back to ranger selection
                </button>
              </div>
            </Card>
          ))}

        {step === 5 && (
          <Card>
            <div className="p-6 text-center">
              <span className="mx-auto flex size-12 items-center justify-center rounded-full bg-forest-100 text-forest-800">
                <Icon name={editId ? "save" : "check"} size={22} />
              </span>
              <h2 className="mt-3 text-base font-semibold text-ink">
                {editId ? "Save changes" : "Ready to publish"}
              </h2>
              <p className="mx-auto mt-1 max-w-md text-sm text-ink-soft">
                {editId
                  ? "Save keeps the current status. Approving immediately activates the authorization for the ranger in the mobile application."
                  : "Approving makes the authorization immediately visible to the ranger in the mobile application. Saving as draft keeps it out of the field until submitted and approved."}
              </p>
              <div className="mt-5 flex justify-center gap-3">
                <button
                  onClick={() => submit("draft")}
                  className="inline-flex h-10 items-center gap-2 rounded-field border border-line-strong bg-white px-5 text-sm font-medium text-ink hover:border-forest-600 hover:text-forest-800"
                >
                  <Icon name="save" size={15} /> {editId ? "Save changes" : "Save draft"}
                </button>
                <button
                  onClick={() => submit("active")}
                  className="inline-flex h-10 items-center gap-2 rounded-field bg-forest-800 px-5 text-sm font-medium text-white shadow-card hover:bg-forest-700"
                >
                  <Icon name="check" size={15} />
                  {editId && editing.data?.status !== "active" ? "Approve authorization" : "Re-save as active"}
                </button>
              </div>
            </div>
          </Card>
        )}
      </div>

      {/* Wizard footer */}
      <div className="mt-4 flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <button
            onClick={() => setStep((s) => Math.max(1, s - 1))}
            disabled={step === 1}
            className="inline-flex h-9 items-center gap-1.5 rounded-field border border-line-strong bg-white px-4 text-sm font-medium text-ink hover:border-forest-600 hover:text-forest-800 disabled:opacity-40"
          >
            <Icon name="chevronLeft" size={14} /> Back
          </button>
          {step > 1 && (
            <button
              onClick={() => setStep(Math.min(step + 1, 5))}
              disabled={step === 5}
              className="inline-flex h-9 items-center gap-1.5 rounded-field border border-line-strong bg-white px-4 text-sm font-medium text-ink hover:border-forest-600 hover:text-forest-800 disabled:opacity-40"
            >
              Next <Icon name="chevronRight" size={14} />
            </button>
          )}
        </div>
        <div className="flex items-center gap-3">
          {/* Save Draft is available on EVERY step with relaxed validation (#6). */}
          <button
            onClick={() => submit("draft")}
            className="inline-flex h-9 items-center gap-1.5 rounded-field border border-line-strong bg-white px-4 text-sm font-medium text-ink hover:border-forest-600 hover:text-forest-800"
          >
            <Icon name="save" size={14} /> Save draft
          </button>
          {step === 3 && !step3Valid && (
            <p className="text-right text-xs text-danger">
              {detailsErrors.reason ?? detailsErrors.instruction ?? detailsErrors.validity}
            </p>
          )}
          {step < 5 && (
            <button
              onClick={() => {
                setMaxCompletedStep((m) => Math.max(m, step + 1));
                setStep((s) => s + 1);
              }}
              disabled={(step === 1 && !rangerId) || (step === 2 && !step2Valid) || (step === 3 && !step3Valid)}
              className="inline-flex h-9 items-center gap-1.5 rounded-field bg-forest-800 px-4 text-sm font-medium text-white shadow-card hover:bg-forest-700 disabled:cursor-not-allowed disabled:opacity-45"
            >
              {step === 3 ? "Review" : step === 2 ? "Continue to details" : "Continue"} <Icon name="chevronRight" size={14} />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

const priorityTone: Record<"low" | "medium" | "high" | "critical", BadgeTone> = {
  low: "neutral",
  medium: "info",
  high: "warning",
  critical: "danger",
};

function Row({ label, value, tone }: { label: string; value: React.ReactNode; tone?: "warn" }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <dt className="shrink-0 text-xs text-ink-soft">{label}</dt>
      <dd className={["text-right text-xs font-medium", tone === "warn" ? "text-[#8a4b00]" : "text-ink"].join(" ")}>{value}</dd>
    </div>
  );
}

function dateInput(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

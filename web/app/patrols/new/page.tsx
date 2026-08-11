"use client";

/**
 * Create patrol (PRD §6.4) — planning form: template quick-pick, type,
 * unit assignment (division → range → beat), schedule, crew assignment
 * and objective. Mock submit → toast + redirect to the patrol list,
 * since no backend exists yet.
 */

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { patrols, rangers } from "@/lib/services";
import { useAsyncData } from "@/lib/use-async";
import { useApp } from "@/lib/store";
import { Card, CardHeader, Field, Input, Select, Textarea, PageHeader, Badge, SegmentedControl } from "@/components/ui";
import { Icon } from "@/components/icons";
import { SkeletonRows, ErrorState } from "@/components/ui/loading";
import { patrolMethodLabels, patrolTypeLabels } from "@/lib/mock/patrols";
import { mockDivisions, mockRanges, mockBeats } from "@/lib/mock/hierarchy";
import type { PatrolMethod, PatrolType } from "@/lib/types";

const types = Object.entries(patrolTypeLabels) as [PatrolType, string][];
const methods = Object.entries(patrolMethodLabels) as [PatrolMethod, string][];
type CrewMode = "individual" | "team";

export default function NewPatrolPage() {
  const router = useRouter();
  const { pushToast } = useApp();
  const templates = useAsyncData(() => patrols.templates());
  const roster = useAsyncData(() => rangers.list());
  const teams = useAsyncData(() => rangers.teams());

  const [title, setTitle] = useState("");
  const [type, setType] = useState<PatrolType>("general-duties");
  const [method, setMethod] = useState<PatrolMethod>("foot");
  const [objective, setObjective] = useState("");
  const [division, setDivision] = useState("d-north");
  const [range, setRange] = useState("r-n1");
  const [beat, setBeat] = useState("b-n1a");
  const [crewMode, setCrewMode] = useState<CrewMode>("team");
  const [individualId, setIndividualId] = useState("");
  const [teamId, setTeamId] = useState("t1");
  const [teamLeaderId, setTeamLeaderId] = useState("");
  const [teamMemberIds, setTeamMemberIds] = useState<string[]>([]);
  const [startDate, setStartDate] = useState(() => dateInput(new Date(Date.now() + 3_600_000)));
  const [fromTemplate, setFromTemplate] = useState(true);

  const ranges = mockRanges[division] ?? [];
  const beats = mockBeats[range] ?? [];

  const allRangers = roster.data ?? [];
  const teamCandidates = allRangers.filter((r) => r.teamId === teamId);
  const rangerName = (id: string) => allRangers.find((r) => r.id === id)?.name ?? "—";
  const teamName = (id: string) => teams.data?.find((t) => t.id === id)?.name ?? "—";

  const crewSummary =
    crewMode === "individual"
      ? `${rangerName(individualId)} (individual)`
      : `${teamName(teamId)} · ${rangerName(teamLeaderId)}${teamMemberIds.length ? ` + ${teamMemberIds.length} member${teamMemberIds.length === 1 ? "" : "s"}` : ""}`;

  const crewValid = crewMode === "individual" ? individualId.length > 0 : teamLeaderId.length > 0;

  const valid = useMemo(
    () => title.trim().length >= 3 && objective.trim().length >= 5 && crewValid,
    [title, objective, crewValid]
  );

  if (templates.loading || !templates.data || roster.loading || !roster.data || teams.loading || !teams.data) {
    return <SkeletonRows rows={6} />;
  }
  if (templates.error) return <ErrorState message={templates.error.message} onRetry={templates.reload} />;

  return (
    <div>
      <PageHeader
        title="Create Patrol"
        subtitle="Plan a new patrol across a beat — assign crew, schedule and objective"
        actions={
          <button
            onClick={() => router.push("/patrols")}
            className="inline-flex h-9 items-center gap-2 rounded-field border border-line-strong bg-white px-3 text-sm font-medium text-ink hover:border-forest-600 hover:text-forest-800"
          >
            <Icon name="chevronLeft" size={15} />
            Back to patrols
          </button>
        }
      />

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <Card>
            <CardHeader title="Patrol details" icon="route" subtitle="Core mission parameters" />
            <div className="grid gap-4 p-5 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <Field label="Patrol title" required hint="Short, descriptive name shown across the portal">
                  <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Morning beat N1-A sweep" />
                </Field>
              </div>

              <Field label="Patrol type" required hint="General duties or combing & surveillance">
                <Select value={type} onChange={(e) => setType(e.target.value as PatrolType)}>
                  {types.map(([v, label]) => (
                    <option key={v} value={v}>{label}</option>
                  ))}
                </Select>
              </Field>

              <Field label="Patrol method" required hint="How the crew moves in the field">
                <Select value={method} onChange={(e) => setMethod(e.target.value as PatrolMethod)}>
                  {methods.map(([v, label]) => (
                    <option key={v} value={v}>{label}</option>
                  ))}
                </Select>
              </Field>

              <Field label="Patrol start time" required hint="When the patrol should begin in the field">
                <Input type="datetime-local" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
              </Field>

              <div className="sm:col-span-2">
                <Field label="Objective" required hint="Clear mission statement used by the dispatch log">
                  <Textarea value={objective} onChange={(e) => setObjective(e.target.value)} placeholder="e.g. Anti-poaching sweep of the riverine belt" />
                </Field>
              </div>
            </div>
          </Card>

          <Card>
            <CardHeader title="Unit assignment" icon="map" subtitle="Where the patrol operates" />
            <div className="grid gap-4 p-5 sm:grid-cols-3">
              <Field label="Division" required>
                <Select value={division} onChange={(e) => { setDivision(e.target.value); setRange(mockRanges[e.target.value]?.[0]?.id ?? ""); }}>
                  {mockDivisions.map((d) => (
                    <option key={d.id} value={d.id}>{d.name}</option>
                  ))}
                </Select>
              </Field>
              <Field label="Range" required>
                <Select value={range} onChange={(e) => { setRange(e.target.value); setBeat(mockBeats[e.target.value]?.[0]?.id ?? ""); }}>
                  {ranges.map((r) => (
                    <option key={r.id} value={r.id}>{r.name}</option>
                  ))}
                </Select>
              </Field>
              <Field label="Beat" required>
                <Select value={beat} onChange={(e) => setBeat(e.target.value)}>
                  {beats.map((b) => (
                    <option key={b.id} value={b.id}>{b.name}</option>
                  ))}
                </Select>
              </Field>
            </div>
          </Card>

          <Card>
            <CardHeader title="Crew" icon="users" subtitle="Who goes — an individual ranger or a full team" />
            <div className="space-y-4 p-5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <SegmentedControl<CrewMode>
                  options={[
                    { value: "individual", label: "Individual ranger" },
                    { value: "team", label: "Team patrol" },
                  ]}
                  value={crewMode}
                  onChange={setCrewMode}
                />
                <span className="text-xs text-ink-faint">
                  {crewMode === "individual" ? "Single-person patrol — one ranger is assigned" : "Team patrol — leader and members are selected"}
                </span>
              </div>

              {crewMode === "individual" ? (
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="Ranger" required hint="The single person assigned to this patrol">
                    <SearchableSelect
                      options={allRangers.map((r) => ({ value: r.id, label: r.name, detail: r.designation }))}
                      value={individualId}
                      onChange={(v) => setIndividualId(v as string)}
                      placeholder="Search rangers by name…"
                    />
                  </Field>
                  <Field label="Template snapshot">
                    <Select value={fromTemplateFlag(fromTemplate)} onChange={(e) => setFromTemplate(e.target.value === "yes")}>
                      <option value="yes">Pre-fill from template (mock)</option>
                      <option value="no">Blank patrol</option>
                    </Select>
                  </Field>
                </div>
              ) : (
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="Team" required hint="Which squad carries out the patrol">
                    <Select
                      value={teamId}
                      onChange={(e) => {
                        const next = e.target.value;
                        setTeamId(next);
                        setTeamLeaderId("");
                        setTeamMemberIds([]);
                        const lead = teams.data?.find((t) => t.id === next)?.leader;
                        const leadRanger = allRangers.find((r) => r.teamId === next && r.name === lead);
                        if (leadRanger) setTeamLeaderId(leadRanger.id);
                      }}
                    >
                      {teams.data.map((t) => (
                        <option key={t.id} value={t.id}>{t.name}</option>
                      ))}
                    </Select>
                  </Field>
                  <Field label="Team leader" required hint="Must be a member of the selected team">
                    <SearchableSelect
                      options={teamCandidates.map((r) => ({ value: r.id, label: r.name, detail: r.designation }))}
                      value={teamLeaderId}
                      onChange={(v) => {
                        const id = v as string;
                        setTeamLeaderId(id);
                        setTeamMemberIds((cur) => cur.filter((m) => m !== id));
                      }}
                      placeholder="Search team members…"
                    />
                  </Field>
                  <div className="sm:col-span-2">
                    <Field label="Team members" hint="Additional members joining the patrol (leader excluded)">
                      <SearchableSelect
                        multiple
                        options={teamCandidates
                          .filter((r) => r.id !== teamLeaderId)
                          .map((r) => ({ value: r.id, label: r.name, detail: r.designation }))}
                        values={teamMemberIds}
                        onChange={(v) => setTeamMemberIds(v as string[])}
                        placeholder="Search and add members…"
                      />
                    </Field>
                  </div>
                  <Field label="Template snapshot">
                    <Select value={fromTemplateFlag(fromTemplate)} onChange={(e) => setFromTemplate(e.target.value === "yes")}>
                      <option value="yes">Pre-fill from template (mock)</option>
                      <option value="no">Blank patrol</option>
                    </Select>
                  </Field>
                </div>
              )}
            </div>
          </Card>
        </div>

        <div className="space-y-4">
          <Card>
            <CardHeader title="Quick start from template" icon="template" subtitle="Pick a saved blueprint" />
            <div className="space-y-2 p-4">
              {templates.data.slice(0, 4).map((t) => (
                <button
                  key={t.id}
                  onClick={() => {
                    setTitle(t.name);
                    setType(t.type);
                    setObjective(t.objective);
                    pushToast("info", "Template applied", `Pre-filled from “${t.name}”`);
                  }}
                  className="w-full rounded-card border border-line bg-surface p-3 text-left transition-colors hover:border-forest-600 hover:bg-forest-50"
                >
                  <p className="flex items-center justify-between text-sm font-medium text-ink">
                    {t.name}
                    <Badge tone="forest">{patrolTypeLabels[t.type]}</Badge>
                  </p>
                  <p className="mt-1 line-clamp-2 text-xs text-ink-soft">{t.objective}</p>
                </button>
              ))}
            </div>
          </Card>

          <Card>
            <CardHeader title="Summary" icon="check" />
            <dl className="space-y-2.5 p-4 text-sm">
              <SummaryRow label="Title" value={title || "—"} />
              <SummaryRow label="Type" value={patrolTypeLabels[type]} />
              <SummaryRow label="Method" value={patrolMethodLabels[method]} />
              <SummaryRow label="Area" value={beatLabel(division, range, beat)} />
              <SummaryRow label="Crew" value={crewSummary} />
              <SummaryRow label="Start time" value={startDate ? formatDateTimeLocal(startDate) : "—"} />
            </dl>
            <div className="border-t border-line p-4">
              <button
                disabled={!valid}
                onClick={() => {
                  pushToast("success", "Patrol created", `Patrol “${title}” is now planned (mock — no backend write)`);
                  router.push("/patrols");
                }}
                className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-field bg-forest-800 text-sm font-medium text-white shadow-card hover:bg-forest-700 disabled:cursor-not-allowed disabled:opacity-45"
              >
                <Icon name="check" size={16} />
                Schedule patrol
              </button>
              {!valid && (
                <p className="mt-2 text-center text-xs text-ink-soft">Title, objective and a crew member are required.</p>
              )}
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}

function dateInput(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function formatDateTimeLocal(v: string): string {
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return v;
  return d.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}

function fromTemplateFlag(on: boolean) {
  return on ? "yes" : "no";
}

const divisionName = (id: string) => mockDivisions.find((d) => d.id === id)?.name ?? id;

function beatLabel(divId: string, rangeId: string, beatId: string): string {
  const r = mockRanges[divId]?.find((x) => x.id === rangeId);
  const b = mockBeats[rangeId]?.find((x) => x.id === beatId);
  return [divisionName(divId), r?.name, b?.name].filter(Boolean).join(" / ");
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <dt className="shrink-0 text-xs text-ink-soft">{label}</dt>
      <dd className="text-right text-xs font-medium text-ink">{value}</dd>
    </div>
  );
}

type SelectOption = { value: string; label: string; detail?: string };

function cn(...parts: Array<string | false | undefined>) {
  return parts.filter(Boolean).join(" ");
}

function SearchableSelect({
  options,
  value,
  values,
  multiple,
  onChange,
  placeholder,
}: {
  options: SelectOption[];
  value?: string;
  values?: string[];
  multiple?: boolean;
  onChange(v: string | string[]): void;
  placeholder?: string;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const wrapRef = useRef<HTMLDivElement>(null);
  const selected = multiple ? values ?? [] : value ? [value] : [];

  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, []);

  const filtered = query.trim()
    ? options.filter((o) => o.label.toLowerCase().includes(query.trim().toLowerCase()))
    : options;

  const pick = (id: string) => {
    if (multiple) {
      const next = selected.includes(id) ? selected.filter((s) => s !== id) : [...selected, id];
      onChange(next);
    } else {
      onChange(id);
      setOpen(false);
      setQuery("");
    }
  };

  const isPicked = (id: string) => selected.includes(id);

  return (
    <div ref={wrapRef} className="relative">
      <div
        role="combobox"
        aria-expanded={open}
        aria-controls={open ? "searchable-select-list" : undefined}
        aria-haspopup="listbox"
        tabIndex={0}
        onClick={() => setOpen((o) => !o)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            setOpen((o) => !o);
          }
        }}
        className={cn(
          "flex min-h-10 w-full cursor-pointer flex-wrap items-center gap-1.5 rounded-field border border-line bg-surface px-3 py-1.5 text-sm text-ink outline-none transition-colors focus:border-forest-600",
          open && "border-forest-600"
        )}
      >
        {selected.map((id) => {
          const o = options.find((x) => x.value === id);
          return (
            <span key={id} className="inline-flex items-center gap-1 rounded-full bg-forest-50 px-2 py-0.5 text-xs font-medium text-forest-800">
              {o?.label ?? id}
              {multiple && (
                <button
                  type="button"
                  aria-label={`Remove ${o?.label ?? id}`}
                  onClick={(e) => {
                    e.stopPropagation();
                    pick(id);
                  }}
                  className="text-forest-600 hover:text-forest-900"
                >
                  ×
                </button>
              )}
            </span>
          );
        })}
        <span className={cn("min-w-24 flex-1 text-xs", selected.length ? "text-ink-soft" : "text-ink-faint")}>
          {selected.length === 0 ? placeholder ?? "Select…" : null}
        </span>
        <Icon name="chevronDown" size={14} className="text-ink-faint" />
      </div>
      {open && (
        <div className="absolute z-30 mt-1 w-full overflow-hidden rounded-card border border-line bg-surface shadow-card">
          <div className="border-b border-line px-3 py-2">
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Type to filter…"
              className="w-full bg-transparent text-sm text-ink outline-none placeholder:text-ink-faint"
            />
          </div>
          <ul id="searchable-select-list" role="listbox" className="max-h-52 overflow-y-auto py-1">
            {filtered.length === 0 && <li className="px-3 py-2 text-xs text-ink-faint">No matches</li>}
            {filtered.map((o) => (
              <li key={o.value}>
                <button
                  type="button"
                  onClick={() => pick(o.value)}
                  className={cn(
                    "flex w-full items-center justify-between gap-2 px-3 py-1.5 text-left text-sm transition-colors hover:bg-forest-50",
                    isPicked(o.value) ? "text-forest-800" : "text-ink"
                  )}
                >
                  <span className="flex min-w-0 flex-col">
                    <span className="truncate font-medium">{o.label}</span>
                    {o.detail && <span className="truncate text-xs text-ink-soft">{o.detail}</span>}
                  </span>
                  <Icon name={isPicked(o.value) ? "check" : "plus"} size={14} className="shrink-0 text-forest-600" />
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
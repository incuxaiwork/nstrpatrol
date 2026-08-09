"use client";

/**
 * Create patrol (PRD §6.4) — planning form: template quick-pick, type,
 * unit assignment (division → range → beat), schedule, crew assignment
 * and objective. Mock submit → toast + redirect to the patrol list,
 * since no backend exists yet.
 */

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { patrols } from "@/lib/services";
import { useAsyncData } from "@/lib/use-async";
import { useApp } from "@/lib/store";
import { Card, CardHeader, Field, Input, Select, Textarea, Switch, PageHeader, Badge } from "@/components/ui";
import { Icon } from "@/components/icons";
import { SkeletonRows, ErrorState } from "@/components/ui/loading";
import { patrolTypeLabels } from "@/lib/mock/patrols";
import { mockDivisions, mockRanges, mockBeats } from "@/lib/mock/hierarchy";
import type { PatrolType } from "@/lib/types";

const types = Object.entries(patrolTypeLabels) as [PatrolType, string][];

export default function NewPatrolPage() {
  const router = useRouter();
  const { pushToast } = useApp();
  const templates = useAsyncData(() => patrols.templates());

  const [title, setTitle] = useState("");
  const [type, setType] = useState<PatrolType>("routine");
  const [objective, setObjective] = useState("");
  const [division, setDivision] = useState("d-north");
  const [range, setRange] = useState("r-n1");
  const [beat, setBeat] = useState("b-n1a");
  const [leader, setLeader] = useState("Aarav Sharma");
  const [members, setMembers] = useState("");
  const [startDate, setStartDate] = useState(dateInput(new Date(Date.now() + 3_600_000)));
  const [duration, setDuration] = useState("180");
  const [fromTemplate, setFromTemplate] = useState(true);

  const ranges = mockRanges[division] ?? [];
  const beats = mockBeats[range] ?? [];

  const valid = useMemo(
    () => title.trim().length >= 3 && objective.trim().length >= 5 && leader.trim().length > 0,
    [title, objective, leader]
  );

  if (templates.loading || !templates.data) return <SkeletonRows rows={6} />;
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

              <Field label="Patrol type" required>
                <Select value={type} onChange={(e) => setType(e.target.value as PatrolType)}>
                  {types.map(([v, label]) => (
                    <option key={v} value={v}>{label}</option>
                  ))}
                </Select>
              </Field>

              <Field label="Duration (minutes)" required>
                <Input type="number" min={30} step={30} value={duration} onChange={(e) => setDuration(e.target.value)} />
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
            <CardHeader title="Crew & schedule" icon="users" subtitle="Who goes and when" />
            <div className="grid gap-4 p-5 sm:grid-cols-2">
              <Field label="Crew leader" required>
                <Select value={leader} onChange={(e) => setLeader(e.target.value)}>
                  {["Aarav Sharma", "Bimla Devi", "Chandra Mohan", "Deepa Nair", "Farhan Ali", "Gauri Patil", "Harsh Vardhan", "Jitendra Kashyap"].map((n) => (
                    <option key={n} value={n}>{n}</option>
                  ))}
                </Select>
              </Field>
              <Field label="Other members" hint="Comma-separated names">
                <Input value={members} onChange={(e) => setMembers(e.target.value)} placeholder="e.g. Eknath Rao, Salim Khan" />
              </Field>
              <Field label="Start time" required>
                <Input type="datetime-local" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
              </Field>
              <Field label="Template snapshot">
                <Select value={fromTemplateFlag(fromTemplate)} onChange={(e) => setFromTemplate(e.target.value === "yes")}>
                  <option value="yes">Pre-fill from template (mock)</option>
                  <option value="no">Blank patrol</option>
                </Select>
              </Field>
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
                    setDuration(String(t.durationMin));
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
              <SummaryRow label="Area" value={beatLabel(division, range, beat)} />
              <SummaryRow label="Leader" value={leader} />
              <SummaryRow label="Duration" value={duration ? `${duration} min` : "—"} />
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
                <p className="mt-2 text-center text-xs text-ink-soft">Title, objective and leader are required.</p>
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
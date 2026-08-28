"use client";

/**
 * Shared ranger intake form (PRD §7 — Create/Early-edit ranger).
 * Used by /rangers/new and /rangers/[id]/edit. Assignment options come
 * from the backend GIS-derived hierarchy (`hierarchy.units()`) and the
 * teams service — never from static fixtures.
 */

import { useMemo, useState } from "react";
import { Card, CardHeader, Field, Input, Select, Badge } from "@/components/ui";
import { Icon } from "@/components/icons";
import { hierarchy, rangers } from "@/lib/services";
import { useAsyncData } from "@/lib/use-async";
import { dutyStatusLabel } from "@/lib/nav";
import type { DutyStatus, Ranger } from "@/lib/types";

const designations = ["Forest Guard", "Assistant Forest Ranger", "Deputy Ranger", "Watchman"];

export default function RangerForm({
  initial,
  submitLabel,
  onSubmit,
  submitting = false,
}: {
  initial?: Ranger;
  submitLabel: string;
  onSubmit(values: Omit<Ranger, "id">): void;
  submitting?: boolean;
}) {
  const [name, setName] = useState(initial?.name ?? "");
  const [code, setCode] = useState(initial?.code ?? "");
  const [designation, setDesignation] = useState(initial?.designation ?? "Forest Guard");
  const [dutyStatus, setDutyStatus] = useState<DutyStatus>(initial?.dutyStatus ?? "on-duty");
  const [division, setDivision] = useState(initial?.division ?? "");
  const [range, setRange] = useState(initial?.range ?? "");
  const [beat, setBeat] = useState(initial?.beat ?? "");
  const [teamId, setTeamId] = useState(initial?.teamId ?? "");
  const [phone, setPhone] = useState(initial?.phone ?? "");
  const [bloodGroup, setBloodGroup] = useState(initial?.bloodGroup ?? "O+");
  const [joinYear, setJoinYear] = useState(String(initial?.joinYear ?? 2026));

  // Real hierarchy + teams from the backend; empty until they load.
  const units = useAsyncData(() => hierarchy.units());
  const teams = useAsyncData(() => rangers.teams());
  const divisions = units.data?.divisions ?? [];
  const ranges = units.data ? units.data.ranges[division] ?? [] : [];
  const beats = units.data ? units.data.beats[range] ?? [] : [];
  const nameIn = (list: { id: string; name: string }[] | undefined, id: string) =>
    list?.find((u) => u.id === id)?.name ?? id;
  const areaLabel =
    [nameIn(divisions, division), nameIn(ranges, range), nameIn(beats, beat)]
      .filter(Boolean)
      .join(" / ") || "—";
  const teamLabel = teams.data?.find((t) => t.id === teamId)?.name || "—";
  const valid = useMemo(() => name.trim().length >= 3, [name]);

  const submit = () => {
    if (!valid) return;
    onSubmit({
      code,
      name: name.trim(),
      designation,
      dutyStatus,
      phone: phone || undefined,
      joinYear: Number(joinYear) || 2026,
      division,
      range,
      beat,
      teamId,
      bloodGroup: bloodGroup || undefined,
      stats: initial?.stats ?? { patrols: 0, distanceKm: 0, fieldHours: 0, coveragePct: 0, observations: 0, incidents: 0 },
      equipment: initial?.equipment,
      vehicleId: initial?.vehicleId,
      weaponId: initial?.weaponId,
      lastSync: initial?.lastSync,
    });
  };

  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <div className="space-y-4 lg:col-span-2">
        <Card>
          <CardHeader title="Identity" icon="users" subtitle="Core personnel details" />
          <div className="grid gap-4 p-5 sm:grid-cols-2">
            <Field label="Full name" required hint="As per service record">
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Kavita Joshi" />
            </Field>
            <Field label="Service code" hint="Leave blank to auto-generate">
              <Input value={code} onChange={(e) => setCode(e.target.value)} placeholder={initial ? "Keep current" : "e.g. R-012"} />
            </Field>
            <Field label="Designation" required>
              <Select value={designation} onChange={(e) => setDesignation(e.target.value)}>
                {designations.map((d) => (
                  <option key={d} value={d}>{d}</option>
                ))}
              </Select>
            </Field>
            <Field label="Duty status" required>
              <Select value={dutyStatus} onChange={(e) => setDutyStatus(e.target.value as DutyStatus)}>
                {Object.entries(dutyStatusLabel).map(([v, l]) => (
                  <option key={v} value={v}>{l}</option>
                ))}
              </Select>
            </Field>
            <Field label="Phone">
              <Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+91 …" />
            </Field>
            <Field label="Blood group">
              <Select value={bloodGroup} onChange={(e) => setBloodGroup(e.target.value)}>
                {["A+", "A-", "B+", "B-", "O+", "O-", "AB+", "AB-"].map((b) => (
                  <option key={b} value={b}>{b}</option>
                ))}
              </Select>
            </Field>
            <Field label="Join year">
              <Input type="number" min={1990} max={2030} value={joinYear} onChange={(e) => setJoinYear(e.target.value)} />
            </Field>
          </div>
        </Card>

        <Card>
          <CardHeader title="Assignment" icon="map" subtitle="Operational unit and team" />
          <div className="grid gap-4 p-5 sm:grid-cols-3">
            <Field label="Division" required hint={units.loading ? "Loading units…" : undefined}>
              <Select value={division} onChange={(e) => {
                const d = e.target.value;
                setDivision(d);
                const firstRange = units.data?.ranges[d]?.[0]?.id ?? "";
                setRange(firstRange);
                setBeat(firstRange ? units.data?.beats[firstRange]?.[0]?.id ?? "" : "");
              }}>
                {divisions.length === 0 && <option value="">Loading…</option>}
                {divisions.map((d) => (
                  <option key={d.id} value={d.id}>{d.name}</option>
                ))}
              </Select>
            </Field>
            <Field label="Range" required>
              <Select value={range} onChange={(e) => { setRange(e.target.value); setBeat(units.data?.beats[e.target.value]?.[0]?.id ?? ""); }}>
                {ranges.length === 0 ? (
                  <option value="">Select a division</option>
                ) : (
                  ranges.map((r) => (
                    <option key={r.id} value={r.id}>{r.name}</option>
                  ))
                )}
              </Select>
            </Field>
            <Field label="Beat" required>
              <Select value={beat} onChange={(e) => setBeat(e.target.value)}>
                {beats.length === 0 ? (
                  <option value="">Select a range</option>
                ) : (
                  beats.map((b) => (
                    <option key={b.id} value={b.id}>{b.name}</option>
                  ))
                )}
              </Select>
            </Field>
            <Field label="Team">
              <Select value={teamId} onChange={(e) => setTeamId(e.target.value)}>
                <option value="">Unassigned</option>
                {(teams.data ?? []).map((t) => (
                  <option key={t.id} value={t.id}>{t.name}</option>
                ))}
              </Select>
            </Field>
          </div>
        </Card>
      </div>

      <div className="space-y-4">
        <Card>
          <CardHeader title="Summary" icon="check" />
          <dl className="space-y-2.5 p-4 text-sm">
            <SummaryRow label="Name" value={name || "—"} />
            <SummaryRow label="Code" value={code || "auto"} />
            <SummaryRow label="Designation" value={designation} />
            <SummaryRow label="Status" value={<Badge tone="neutral">{dutyStatusLabel[dutyStatus]}</Badge>} />
            <SummaryRow label="Area" value={areaLabel} />
            <SummaryRow label="Team" value={teamLabel} />
          </dl>
          <div className="border-t border-line p-4">
            <button
              disabled={!valid || submitting}
              onClick={submit}
              className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-field bg-forest-800 text-sm font-medium text-white shadow-card hover:bg-forest-700 disabled:cursor-not-allowed disabled:opacity-45"
            >
              <Icon name="check" size={16} />
              {submitting ? "Saving…" : submitLabel}
            </button>
            {!valid && <p className="mt-2 text-center text-xs text-ink-soft">Name is required.</p>}
          </div>
        </Card>
      </div>
    </div>
  );
}

function SummaryRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <dt className="shrink-0 text-xs text-ink-soft">{label}</dt>
      <dd className="text-right text-xs font-medium text-ink">{value}</dd>
    </div>
  );
}
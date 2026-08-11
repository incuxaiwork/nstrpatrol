"use client";

/**
 * Create ranger (PRD §7 — Create Ranger): personnel intake form.
 * Mock submit → toast + redirect to the directory, since no backend
 * exists yet.
 */

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { useApp } from "@/lib/store";
import { Card, CardHeader, Field, Input, Select, PageHeader, Badge } from "@/components/ui";
import { Icon } from "@/components/icons";
import { mockDivisions, mockRanges, mockBeats } from "@/lib/mock/hierarchy";
import { mockTeams } from "@/lib/mock/people";
import { dutyStatusLabel } from "@/lib/nav";
import type { DutyStatus } from "@/lib/types";

const designations = ["Forest Guard", "Assistant Forest Ranger", "Deputy Ranger", "Watchman"];

export default function NewRangerPage() {
  const router = useRouter();
  const { pushToast } = useApp();

  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [designation, setDesignation] = useState("Forest Guard");
  const [dutyStatus, setDutyStatus] = useState<DutyStatus>("on-duty");
  const [division, setDivision] = useState("d-north");
  const [range, setRange] = useState("r-n1");
  const [beat, setBeat] = useState("b-n1a");
  const [teamId, setTeamId] = useState("t1");
  const [phone, setPhone] = useState("");
  const [bloodGroup, setBloodGroup] = useState("O+");
  const [joinYear, setJoinYear] = useState("2026");

  const ranges = mockRanges[division] ?? [];
  const beats = mockBeats[range] ?? [];

  const valid = useMemo(() => name.trim().length >= 3, [name]);

  return (
    <div>
      <PageHeader
        title="Create Ranger"
        subtitle="Add a new personnel record to the directory"
        actions={
          <button
            onClick={() => router.push("/rangers")}
            className="inline-flex h-9 items-center gap-2 rounded-field border border-line-strong bg-white px-3 text-sm font-medium text-ink hover:border-forest-600 hover:text-forest-800"
          >
            <Icon name="chevronLeft" size={15} />
            Back to directory
          </button>
        }
      />

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <Card>
            <CardHeader title="Identity" icon="users" subtitle="Core personnel details" />
            <div className="grid gap-4 p-5 sm:grid-cols-2">
              <Field label="Full name" required hint="As per service record">
                <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Kavita Joshi" />
              </Field>
              <Field label="Service code" hint="Leave blank to auto-generate">
                <Input value={code} onChange={(e) => setCode(e.target.value)} placeholder="e.g. R-012" />
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
              <Field label="Team">
                <Select value={teamId} onChange={(e) => setTeamId(e.target.value)}>
                  {mockTeams.map((t) => (
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
              <SummaryRow label="Area" value={`${divisionLabel(division, range, beat)}`} />
              <SummaryRow label="Team" value={mockTeams.find((t) => t.id === teamId)?.name ?? "—"} />
            </dl>
            <div className="border-t border-line p-4">
              <button
                disabled={!valid}
                onClick={() => {
                  pushToast("success", "Ranger created", `${name} added to the directory (mock — no backend write)`);
                  router.push("/rangers");
                }}
                className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-field bg-forest-800 text-sm font-medium text-white shadow-card hover:bg-forest-700 disabled:cursor-not-allowed disabled:opacity-45"
              >
                <Icon name="check" size={16} />
                Add ranger record
              </button>
              {!valid && <p className="mt-2 text-center text-xs text-ink-soft">Name is required.</p>}
            </div>
          </Card>
        </div>
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

function divisionLabel(division: string, range: string, beat: string) {
  const d = mockDivisions.find((x) => x.id === division)?.name ?? division;
  const r = (mockRanges[division] ?? []).find((x) => x.id === range)?.name ?? range;
  const b = (mockBeats[range] ?? []).find((x) => x.id === beat)?.name ?? beat;
  return `${d} / ${r} / ${b}`;
}
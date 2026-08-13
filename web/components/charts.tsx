"use client";

/**
 * Dependency-free SVG charts sized to the design system.
 * No external charting library — keeps bundle small per project rules.
 */

import { cn } from "@/lib/utils";
import type { AnalyticsDataset } from "@/lib/types";

const PALETTE = ["#1F4626", "#C3B091", "#1B365D", "#B3261E", "#4A6572", "#FF8F00"];

/* ------------------------------------------------------------------ */
/* Sparkline                                                          */
/* ------------------------------------------------------------------ */

export function Sparkline({
  values,
  width = 96,
  height = 28,
  color = "#2E7D32",
}: {
  values: number[];
  width?: number;
  height?: number;
  color?: string;
}) {
  if (values.length < 2) return null;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const pts = values.map((v, i) => {
    const x = (i / (values.length - 1)) * (width - 2);
    const y = height - 2 - ((v - min) / span) * (height - 4);
    return [x + 1, y];
  });
  const d = pts.map((p, i) => `${i === 0 ? "M" : "L"}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(" ");
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} aria-hidden="true">
      <path d={d} fill="none" stroke={color} strokeWidth="1.8" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}

/* ------------------------------------------------------------------ */
/* Bar chart                                                          */
/* ------------------------------------------------------------------ */

export function BarChart({
  dataset,
  valueFormatter = (v: number) => String(v),
}: {
  dataset: AnalyticsDataset;
  valueFormatter?: (v: number) => string;
}) {
  const { labels, series } = dataset;
  return (
    <div>
      {labels.map((label, i) => {
        const row = series.map((s) => s.values[i] ?? 0);
        const total = row.reduce((a, b) => a + b, 0);
        return (
          <div key={label} className="flex items-center gap-3 py-1">
            <span className="w-14 shrink-0 text-right text-xs text-ink-soft">{label}</span>
            <div className="flex flex-1 items-center gap-1.5">
              {row.map((v, j) => (
                <div key={j} className="flex h-4 flex-1 items-center overflow-hidden rounded-[3px] bg-zinc-100">
                  <div
                    className="h-full rounded-[3px] transition-all"
                    style={{ width: `${(v / total) * 100}%`, background: PALETTE[j % PALETTE.length] }}
                    title={`${series[j].name}: ${valueFormatter(v)}`}
                  />
                </div>
              ))}
            </div>
            <span className="w-10 shrink-0 text-xs font-medium text-ink">{valueFormatter(total)}</span>
          </div>
        );
      })}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Grouped bar (vertical, for comparisons)                            */
/* ------------------------------------------------------------------ */

export function GroupBars({
  dataset,
  height = 180,
}: {
  dataset: AnalyticsDataset;
  height?: number;
}) {
  const { labels, series } = dataset;
  const groups = labels.length;
  const max = Math.max(...series.flatMap((s) => s.values), 1);
  return (
    <svg width="100%" height={height} viewBox={`0 0 100 ${height}`} preserveAspectRatio="none" aria-hidden="true">
      {[0.25, 0.5, 0.75, 1].map((f) => (
        <line key={f} x1="2" x2="98" y1={height - f * (height - 30)} y2={height - f * (height - 30)} stroke="#E3E7EC" strokeWidth="0.4" />
      ))}
      {labels.map((lab, i) => {
        const groupW = 96 / groups;
        const barW = groupW / series.length;
        return series.map((s, j) => {
          const v = s.values[i] ?? 0;
          const h = (v / max) * (height - 34);
          const x = 2 + i * groupW + j * barW + 1;
          return (
            <rect
              key={`${lab}-${j}`}
              x={x}
              y={height - 8 - h}
              width={Math.max(barW - 2, 0.5)}
              height={h}
              fill={PALETTE[j % PALETTE.length]}
              rx="0.6"
            >
              <title>{`${lab} · ${s.name}: ${v}`}</title>
            </rect>
          );
        });
      })}
    </svg>
  );
}

/* ------------------------------------------------------------------ */
/* Line / area chart                                                  */
/* ------------------------------------------------------------------ */

export function LineChart({
  dataset,
  height = 200,
  area = true,
  valueFormatter = (v: number) => String(v),
}: {
  dataset: AnalyticsDataset;
  height?: number;
  area?: boolean;
  valueFormatter?: (v: number) => string;
}) {
  const { labels, series } = dataset;
  const W = 600;
  const H = height * (600 / 300); // scale to viewBox aspect
  const padL = 10;
  const padR = 10;
  const padT = 14;
  const padB = 26;
  const max = Math.max(...series.flatMap((s) => s.values), 1) * 1.15;
  const xStep = (W - padL - padR) / Math.max(labels.length - 1, 1);

  const toXY = (vals: number[]) =>
    vals.map((v, i) => ({
      x: padL + i * xStep,
      y: padT + (1 - v / max) * (H - padT - padB),
    }));

  const yGrid = (H - padT - padB);
  return (
    <div>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label={dataset.series.map((s) => s.name).join(", ")}>
        <defs>
          <linearGradient id="spark-area" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={PALETTE[0]} stopOpacity="0.12" />
            <stop offset="100%" stopColor={PALETTE[0]} stopOpacity="0" />
          </linearGradient>
        </defs>
        {[0, 0.25, 0.5, 0.75, 1].map((f) => (
          <line key={f} x1={padL} x2={W - padR} y1={padT + f * yGrid} y2={padT + f * yGrid} stroke="#E3E7EC" strokeWidth="1" />
        ))}
        {labels.map((lab, i) => (
          <text key={lab} x={padL + i * xStep} y={H - 8} textAnchor="middle" fontSize="9" fill="#757575">
            {lab}
          </text>
        ))}
        {series.map((s, j) => {
          const pts = toXY(s.values);
          if (pts.length === 0) return null;
          const d = pts.map((p, i) => `${i ? "L" : "M"}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ");
          const col = PALETTE[j % PALETTE.length];
          return (
            <g key={s.name}>
              {area && j === 0 && (
                <path
                  d={`${d} L${pts[pts.length - 1].x.toFixed(1)},${H - padB} L${pts[0].x.toFixed(1)},${H - padB} Z`}
                  fill={col}
                  opacity="0.08"
                />
              )}
              <path d={d} fill="none" stroke={col} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" strokeDasharray={s.name === "Coverage" ? "5 4" : undefined} />
              {pts.map((p, k) => (
                <circle key={k} cx={p.x} cy={p.y} r="2.6" fill="#fff" stroke={col} strokeWidth="1.6">
                  <title>{`${labels[k]} · ${s.name}: ${valueFormatter(s.values[k])}`}</title>
                </circle>
              ))}
            </g>
          );
        })}
      </svg>
      <ChartLegend dataset={dataset} />
    </div>
  );
}

function ChartLegend({ dataset }: { dataset: AnalyticsDataset }) {
  return (
    <div className="mt-2 flex flex-wrap items-center justify-center gap-x-4 gap-y-1">
      {dataset.series.map((s, j) => (
        <span key={s.name} className="inline-flex items-center gap-1.5 text-xs text-ink-soft">
          <span className="size-2.5 rounded-sm" style={{ background: PALETTE[j % PALETTE.length] }} />
          {s.name}
        </span>
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Donut chart                                                        */
/* ------------------------------------------------------------------ */

export function Donut({
  segments,
  size = 148,
  thick = 20,
  centerLabel,
  centerValue,
}: {
  segments: { label: string; value: number; color: string }[];
  size?: number;
  thick?: number;
  centerLabel?: string;
  centerValue?: string;
}) {
  const total = segments.reduce((a, s) => a + s.value, 0) || 1;
  const r = (size - thick) / 2;
  const c = 2 * Math.PI * r;
  const placed = segments.reduce(
    (acc, s) => {
      const rot = (acc.offset / total) * 360;
      acc.items.push({ ...s, rot });
      acc.offset += s.value;
      return acc;
    },
    { items: [] as { label: string; value: number; color: string; rot: number }[], offset: 0 }
  );
  return (
    <div className="relative inline-flex items-center justify-center">
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label="Donut chart">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#f0f2f4" strokeWidth={thick} />
        {placed.items.map((s) => {
          const frac = s.value / total;
          const dash = `${frac * c} ${c}`;
          return (
            <circle
              key={s.label}
              cx={size / 2}
              cy={size / 2}
              r={r}
              fill="none"
              stroke={s.color}
              strokeWidth={thick}
              strokeDasharray={dash}
              transform={`rotate(${s.rot} ${size / 2} ${size / 2})`}
            >
              <title>{`${s.label}: ${s.value}`}</title>
            </circle>
          );
        })}
      </svg>
      <div className="absolute text-center">
        {centerValue && <div className="text-xl font-semibold text-ink">{centerValue}</div>}
        {centerLabel && <div className="text-[11px] text-ink-soft">{centerLabel}</div>}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Legend list                                                        */
/* ------------------------------------------------------------------ */

export function DonutLegend({ segments }: { segments: { label: string; value: number; color: string }[] }) {
  const total = segments.reduce((a, s) => a + s.value, 0) || 1;
  return (
    <ul className="flex flex-col gap-1.5">
      {segments.map((s) => (
        <li key={s.label} className="flex items-center gap-2 text-sm">
          <span className="size-2.5 rounded-sm" style={{ background: s.color }} />
          <span className="flex-1 text-ink">{s.label}</span>
          <span className="text-xs text-ink-soft">{s.value}</span>
          <span className="w-10 text-right text-xs font-medium text-ink-soft">
            {Math.round((s.value / total) * 100)}%
          </span>
        </li>
      ))}
    </ul>
  );
}

/* ------------------------------------------------------------------ */
/* Heatmap (analytics grid)                                           */
/* ------------------------------------------------------------------ */

export function GridHeatmap({
  rowLabels,
  colLabels,
  values,
}: {
  rowLabels: string[];
  colLabels: string[];
  values: number[][];
}) {
  return (
    <div className="overflow-x-auto">
      <div className="inline-block min-w-full">
        <div className="grid gap-1" style={{ gridTemplateColumns: `auto repeat(${colLabels.length}, minmax(44px, 1fr))` }}>
          <div />
          {colLabels.map((c) => (
            <div key={c} className="text-center text-[11px] font-medium text-ink-soft">{c}</div>
          ))}
          {rowLabels.flatMap((r, i) => [
            <div key={`r${i}`} className="flex items-center pr-2 text-[11px] text-ink-soft">{r}</div>,
            ...colLabels.map((c, j) => {
              const v = values[i]?.[j] ?? 0;
              const alpha = 0.08 + (v / 100) * 0.92;
              return (
                <div
                  key={`${r}-${c}`}
                  className="flex h-9 items-center justify-center rounded-[4px] text-[11px] font-medium text-white"
                  style={{ background: `rgba(31, 70, 38, ${alpha})` }}
                  title={`${r} / ${c}: ${v}%`}
                >
                  {v > 0 ? v : ""}
                </div>
              );
            }),
          ])}
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Horizontal progress bars (beat coverage)                           */
/* ------------------------------------------------------------------ */

export function CoverageBars({ labels, values }: { labels: string[]; values: number[] }) {
  return (
    <div className="flex flex-col gap-2">
      {labels.map((l, i) => (
        <div key={l} className="flex items-center gap-3">
          <span className="w-12 shrink-0 text-xs text-ink-soft">{l}</span>
          <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-zinc-100">
            <div
              className={cn("h-full rounded-full", values[i] >= 80 ? "bg-forest-600" : values[i] >= 60 ? "bg-warning" : "bg-danger")}
              style={{ width: `${values[i]}%` }}
            />
          </div>
          <span className="w-9 shrink-0 text-right text-xs font-medium text-ink">{values[i]}%</span>
        </div>
      ))}
    </div>
  );
}
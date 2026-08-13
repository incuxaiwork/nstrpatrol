/**
 * Client-side export utilities — CSV / JSON download that actually produces
 * a file. Used by the ExportDialog and per-page download controls.
 */

export type ExportFormat = "CSV" | "JSON";

function escapeCsvCell(value: unknown): string {
  const s = String(value ?? "");
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

export function toCsv(rows: Record<string, unknown>[]): string {
  if (rows.length === 0) return "";
  const headers = Object.keys(rows[0]);
  const lines = [
    headers.map(escapeCsvCell).join(","),
    ...rows.map((r) => headers.map((h) => escapeCsvCell(r[h])).join(",")),
  ];
  return lines.join("\r\n");
}

export function downloadBlob(filename: string, content: string, mime: string) {
  const blob = new Blob(["\uFEFF" + content], { type: `${mime};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function downloadCsv(filename: string, rows: Record<string, unknown>[]) {
  downloadBlob(filename, toCsv(rows), "text/csv");
}

export function downloadJson(filename: string, data: unknown) {
  downloadBlob(filename, JSON.stringify(data, null, 2), "application/json");
}

export function exportRows(
  format: ExportFormat,
  filename: string,
  rows: Record<string, unknown>[]
) {
  if (format === "CSV") downloadCsv(filename, rows);
  else downloadJson(filename, rows);
}

export function stamp(): string {
  return new Date().toISOString().slice(0, 10);
}
/**
 * Generate Report — the consistent entry button for every report flow.
 */

import { Icon } from "@/components/icons";

export function ReportButton({
  onClick,
  label = "Generate Report",
}: {
  onClick(): void;
  label?: string;
}) {
  return (
    <button
      onClick={onClick}
      className="inline-flex h-9 items-center gap-2 rounded-field bg-forest-800 px-3.5 text-sm font-medium text-white shadow-card hover:bg-forest-700"
    >
      <Icon name="file" size={15} />
      {label}
    </button>
  );
}
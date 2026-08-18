/**
 * Report flow dialog — shared phase machine for every report generator:
 * filters → loading → result (or empty / error). Handles regeneration,
 * file export (reuses the portal ExportDialog) and dismissal so the
 * per-report dialogs stay thin.
 */

import { useEffect, useRef, useState } from "react";
import { Dialog, ExportDialog } from "@/components/overlays";
import { Button } from "@/components/ui";
import { Spinner, EmptyState } from "@/components/ui/loading";

export type ReportPhase = "filters" | "loading" | "empty" | "error" | "result";

export interface ReportDialogProps<T> {
  open: boolean;
  onClose(): void;
  title: string;
  note?: string;
  /** true = no filter step (single-record reports); runs on open. */
  autoRun?: boolean;
  canGenerate: boolean;
  renderFilters(): React.ReactNode;
  run(): Promise<T | undefined>;
  renderResult(data: T): React.ReactNode;
  /** Returns the filename base + rows for the portal export dialog. */
  exportData?(data: T): { filename: string; rows: Record<string, unknown>[] };
}

export function ReportDialog<T>({
  open,
  onClose,
  title,
  note,
  autoRun,
  canGenerate,
  renderFilters,
  run,
  renderResult,
  exportData,
}: ReportDialogProps<T>) {
  const [phase, setPhase] = useState<ReportPhase>(autoRun ? "loading" : "filters");
  const [data, setData] = useState<T | undefined>(undefined);
  const [exportOpen, setExportOpen] = useState(false);
  const openedRef = useRef(false);

  const generate = async () => {
    setPhase("loading");
    await execute();
  };

  const execute = async () => {
    try {
      const result = await run();
      if (result === undefined) {
        setPhase("empty");
      } else {
        setData(result);
        setPhase("result");
      }
    } catch {
      setPhase("error");
    }
  };

  useEffect(() => {
    if (open && !openedRef.current) {
      openedRef.current = true;
      if (autoRun) void execute();
    }
    if (!open) openedRef.current = false;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const handleClose = () => {
    setData(undefined);
    setPhase(autoRun ? "loading" : "filters");
    setExportOpen(false);
    onClose();
  };

  const toFilters = () => {
    setData(undefined);
    setPhase("filters");
  };

  const backAction = () => (autoRun ? handleClose() : toFilters());

  const footer = (() => {
    switch (phase) {
      case "filters":
        return (
          <>
            <Button variant="ghost" onClick={handleClose}>
              Cancel
            </Button>
            <Button onClick={() => void generate()} disabled={!canGenerate}>
              Generate Report
            </Button>
          </>
        );
      case "loading":
        return (
          <Button variant="ghost" onClick={handleClose}>
            Cancel
          </Button>
        );
      case "empty":
      case "error":
        return (
          <Button variant="ghost" onClick={backAction}>
            {autoRun ? "Close" : "Back to filters"}
          </Button>
        );
      case "result":
        return (
          <>
            <Button variant="ghost" onClick={handleClose}>
              Close
            </Button>
            {!autoRun && (
              <Button variant="ghost" onClick={toFilters}>
                New report
              </Button>
            )}
            {exportData && data !== undefined && (
              <>
                <Button onClick={() => setExportOpen(true)} icon="download">
                  Download
                </Button>
                <ExportDialog
                  open={exportOpen}
                  onClose={() => setExportOpen(false)}
                  rows={exportData(data as T).rows}
                  filename={exportData(data as T).filename}
                />
              </>
            )}
          </>
        );
    }
  })();

  return (
    <Dialog
      open={open}
      onClose={handleClose}
      title={title}
      icon="file"
      wide
      footer={footer}
    >
      {note && <p className="mb-3 text-xs text-ink-soft">{note}</p>}
      {phase === "filters" && renderFilters()}
      {phase === "loading" && (
        <div className="flex flex-col items-center gap-3 py-12 text-ink-soft" role="status">
          <Spinner className="size-7 text-forest-700" />
          <p className="text-sm">Generating report…</p>
        </div>
      )}
      {phase === "empty" && (
        <EmptyState
          icon="filter"
          title="No records match these filters"
          description="Try widening the date range or clearing the region filters."
          action={
            <Button variant="ghost" onClick={backAction}>
              {autoRun ? "Close" : "Back to filters"}
            </Button>
          }
        />
      )}
      {phase === "error" && (
        <EmptyState
          icon="search"
          title="Could not generate the report"
          description="The data could not be loaded. Please try again."
          action={
            <Button variant="ghost" onClick={backAction}>
              {autoRun ? "Close" : "Back to filters"}
            </Button>
          }
        />
      )}
      {phase === "result" && data !== undefined && renderResult(data)}
    </Dialog>
  );
}
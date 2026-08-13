"use client";

/**
 * Media viewer for observations & reports (PRD §8.3) — full-screen lightbox
 * with navigation and zoom for photos, and an in-place voice-note player
 * with simulated playback states (mock audio until field files exist).
 */

import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import { Icon, type IconName } from "@/components/icons";
import type { ObservationMedia } from "@/lib/types";
import { formatDateTime } from "@/lib/utils";

/* ------------------------------------------------------------------ */
/* Voice player (simulated)                                           */
/* ------------------------------------------------------------------ */

export function VoicePlayer({
  label,
  durationSec = 30,
  className,
}: {
  label: string;
  durationSec?: number;
  className?: string;
}) {
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    if (!playing) return;
    const id = setInterval(() => {
      setProgress((p) => {
        if (p >= 1) {
          setPlaying(false);
          return 1;
        }
        return p + 0.02;
      });
    }, 120);
    return () => clearInterval(id);
  }, [playing]);

  const pct = Math.round(progress * 100);
  const elapsed = Math.round(progress * durationSec);

  return (
    <div
      className={cn(
        "flex items-center gap-3 rounded-card border border-line bg-surface p-3",
        className
      )}
      role="group"
      aria-label="Voice note player"
    >
      <button
        onClick={() => setPlaying((v) => !v)}
        aria-label={playing ? "Pause voice note" : "Play voice note"}
        className="flex size-9 shrink-0 items-center justify-center rounded-full bg-forest-800 text-white transition-colors hover:bg-forest-700"
      >
        <Icon name={playing ? "pause" : "play"} size={15} />
      </button>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-ink">{label}</p>
        <div className="mt-1.5 flex items-center gap-2">
          <input
            type="range"
            min={0}
            max={100}
            value={pct}
            onChange={(e) => {
              setProgress(Number(e.target.value) / 100);
              setPlaying(false);
            }}
            aria-label="Voice note progress"
            className="flex-1 accent-forest-700"
          />
          <span className="w-16 shrink-0 text-right text-[11px] tabular-nums text-ink-soft">
            {playing
              ? `${formatDuration(elapsed)}`
              : progress >= 1
                ? formatDuration(durationSec)
                : `${formatDuration(elapsed)} / ${formatDuration(durationSec)}`}
          </span>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Media lightbox                                                     */
/* ------------------------------------------------------------------ */

export function MediaViewer({
  items,
  index,
  onClose,
  onIndexChange,
}: {
  items: ObservationMedia[];
  index: number;
  onClose(): void;
  onIndexChange(i: number): void;
}) {
  const [zoom, setZoom] = useState(1);
  const item = items[index];

  const [prevIndex, setPrevIndex] = useState(index);
  if (prevIndex !== index) {
    setPrevIndex(index);
    setZoom(1);
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowLeft") onIndexChange((index - 1 + items.length) % items.length);
      if (e.key === "ArrowRight") onIndexChange((index + 1) % items.length);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [index, items.length, onClose, onIndexChange]);

  if (!item || items.length === 0) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col bg-zinc-950/90"
      role="dialog"
      aria-modal="true"
      aria-label={item.label}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      {/* Header */}
      <div className="flex items-center justify-between gap-3 border-b border-white/10 px-4 py-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-white">
            {item.label}
            {item.type === "audio" ? " · voice note" : " · photo"}
          </p>
          <p className="text-xs text-white/60">{formatDateTime(item.captureTime)}</p>
        </div>
        <div className="flex items-center gap-2">
          {item.type === "photo" && (
            <>
              <ViewerButton label="Zoom out" icon="zoomOut" onClick={() => setZoom((z) => Math.max(0.5, z - 0.25))} />
              <ViewerButton label="Zoom in" icon="zoomIn" onClick={() => setZoom((z) => Math.min(3, z + 0.25))} />
            </>
          )}
          <button
            onClick={onClose}
            aria-label="Close viewer"
            className="flex size-8 items-center justify-center rounded-md bg-white/10 text-white hover:bg-white/20"
          >
            <Icon name="x" size={17} />
          </button>
        </div>
      </div>

      {/* Body */}
      <div className="flex flex-1 items-center justify-center overflow-auto p-6">
        {item.type === "audio" ? (
          <div className="w-full max-w-xl space-y-4">
            <div className="flex flex-col items-center gap-3 rounded-card border border-white/10 bg-white p-8 text-center">
              <span className="flex size-14 items-center justify-center rounded-full bg-forest-100 text-forest-800">
                <Icon name="radio" size={24} />
              </span>
              <p className="text-sm font-medium text-ink">Field voice note</p>
              <VoicePlayer label={item.label} durationSec={item.captureTime ? 30 : 30} />
              <p className="text-xs text-ink-soft">
                Transcript is generated after sync — backend delivery pending (mock playback).
              </p>
            </div>
          </div>
        ) : (
          <div
            className="flex aspect-video max-h-full w-full max-w-3xl items-center justify-center overflow-hidden rounded-card border border-white/10 bg-[#e8e4da]"
            style={{ transform: `scale(${zoom})` }}
            aria-hidden="true"
          >
            <div className="flex flex-col items-center gap-3 text-ink-faint">
              <Icon name="camera" size={44} />
              <p className="text-sm">{item.label}</p>
            </div>
          </div>
        )}
      </div>

      {/* Footer — thumbnails + nav */}
      {items.length > 1 && (
        <div className="flex items-center justify-center gap-3 border-t border-white/10 px-4 py-3">
          <button
            onClick={() => onIndexChange((index - 1 + items.length) % items.length)}
            aria-label="Previous media"
            className="flex size-9 items-center justify-center rounded-md bg-white/10 text-white hover:bg-white/20"
          >
            <Icon name="chevronLeft" size={16} />
          </button>
          <div className="flex items-center gap-2">
            {items.map((m, i) => (
              <button
                key={`${m.label}-${i}`}
                onClick={() => onIndexChange(i)}
                aria-label={`View ${m.label}`}
                className={cn(
                  "flex h-11 w-16 items-center justify-center rounded-md border text-[11px] font-medium",
                  i === index
                    ? "border-white bg-white/20 text-white"
                    : "border-white/15 bg-white/5 text-white/50 hover:bg-white/10"
                )}
              >
                <Icon name={m.type === "photo" ? "camera" : "radio"} size={14} />
              </button>
            ))}
          </div>
          <button
            onClick={() => onIndexChange((index + 1) % items.length)}
            aria-label="Next media"
            className="flex size-9 items-center justify-center rounded-md bg-white/10 text-white hover:bg-white/20"
          >
            <Icon name="chevronRight" size={16} />
          </button>
        </div>
      )}
    </div>
  );
}

function ViewerButton({ label, icon, onClick }: { label: string; icon: IconName; onClick(): void }) {
  return (
    <button
      onClick={onClick}
      aria-label={label}
      title={label}
      className="flex size-8 items-center justify-center rounded-md bg-white/10 text-white hover:bg-white/20"
    >
      <Icon name={icon} size={15} />
    </button>
  );
}

function formatDuration(s: number): string {
  const m = Math.floor(s / 60);
  const sec = Math.round(s % 60);
  return `${m}:${String(sec).padStart(2, "0")}`;
}
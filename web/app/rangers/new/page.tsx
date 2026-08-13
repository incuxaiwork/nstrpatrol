"use client";

/**
 * Create ranger (PRD §7 — Create Ranger): personnel intake form.
 * Writes through the in-memory mock store (no backend yet).
 */

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useApp } from "@/lib/store";
import { PageHeader } from "@/components/ui";
import { Icon } from "@/components/icons";
import RangerForm from "@/components/ranger-form";
import { rangers } from "@/lib/services";
import type { Ranger } from "@/lib/types";

export default function NewRangerPage() {
  const router = useRouter();
  const { pushToast } = useApp();
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (values: Omit<Ranger, "id">) => {
    setSubmitting(true);
    const record = await rangers.create(values);
    pushToast("success", "Ranger created", `${record.name} added to the directory (mock store)`);
    router.push(`/rangers/${record.id}`);
  };

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

      <RangerForm submitLabel="Add ranger record" submitting={submitting} onSubmit={handleSubmit} />
    </div>
  );
}
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

  const handleSubmit = async (values: Omit<Ranger, "id"> & { email?: string; password?: string }) => {
    setSubmitting(true);
    try {
      const record = await rangers.create(values);
      pushToast(
        "success",
        "User account provisioned",
        `${record.name} created — they can now sign in with the email you set.`
      );
      router.push(`/rangers/${record.id}`);
    } catch (err) {
      pushToast(
        "error",
        "Provisioning failed",
        err instanceof Error ? err.message : "Backend rejected the request"
      );
      setSubmitting(false);
    }
  };

  return (
    <div>
      <PageHeader
        title="Provision User Account"
        subtitle="Create a ranger and their platform sign-in credentials in one step"
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

      <RangerForm submitLabel="Provision account" submitting={submitting} onSubmit={handleSubmit} />
    </div>
  );
}
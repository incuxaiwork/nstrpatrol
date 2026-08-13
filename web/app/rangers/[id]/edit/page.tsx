"use client";

/**
 * Edit ranger (PRD §7 — full CRUD): pre-filled intake form writing back
 * to the in-memory mock store.
 */

import { useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { useApp } from "@/lib/store";
import { PageHeader } from "@/components/ui";
import { Icon } from "@/components/icons";
import RangerForm from "@/components/ranger-form";
import { rangers } from "@/lib/services";
import { useAsyncData } from "@/lib/use-async";
import { SkeletonRows, ErrorState, EmptyState } from "@/components/ui/loading";
import type { Ranger } from "@/lib/types";

export default function EditRangerPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const { pushToast } = useApp();
  const { data: ranger, error, loading, reload } = useAsyncData(() => rangers.get(params.id));
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (values: Omit<Ranger, "id">) => {
    if (!ranger) return;
    setSubmitting(true);
    await rangers.update(params.id, values);
    pushToast("success", "Ranger updated", `${values.name} record saved (mock store)`);
    router.push(`/rangers/${params.id}`);
  };

  if (loading) return <SkeletonRows rows={7} />;
  if (error) return <ErrorState message={error.message} onRetry={reload} />;
  if (!ranger) {
    return (
      <div className="rounded-card border border-line bg-white shadow-card">
        <EmptyState
          title={`Ranger ${params.id} not found`}
          description="The record may not exist in the mock data."
          action={
            <Link href="/rangers" className="inline-flex h-8 items-center gap-1.5 rounded-field bg-forest-800 px-3 text-xs font-medium text-white hover:bg-forest-700">
              <Icon name="chevronLeft" size={12} /> Back to directory
            </Link>
          }
        />
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title={`Edit ${ranger.name}`}
        subtitle={`${ranger.code} · ${ranger.designation} · update personnel & assignment details`}
        actions={
          <Link
            href={`/rangers/${ranger.id}`}
            className="inline-flex h-9 items-center gap-2 rounded-field border border-line-strong bg-white px-3 text-sm font-medium text-ink hover:border-forest-600 hover:text-forest-800"
          >
            <Icon name="chevronLeft" size={15} />
            Back to profile
          </Link>
        }
      />

      <RangerForm initial={ranger} submitLabel="Save changes" submitting={submitting} onSubmit={handleSubmit} />
    </div>
  );
}
"use client";

import { Suspense, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DashboardPageShell } from "@/components/shared/dashboard-page-shell";
import { ErrorBox } from "@/components/shared/error-box";
import { FRAME_SECTION_GAP_CLASS, LIST_ROW_WRAPPER_CLASS } from "@/components/shared/layout-tokens";
import { PhotosSection, type PhotosSectionHandle } from "@/components/shared/photos-section";

/**
 * Full-page photo gallery for one lead (Story 106 follow-up) — same
 * frame look as Knowledge's category pages (3 columns here instead of 2),
 * large tiles with empty placeholder cells. Not a separate feature: reuses
 * the same `PhotosSection` component and `/api/leads/photos` endpoints.
 * The "+ Add" trigger is this page's own button, styled exactly like Daily
 * Tracker's (`views/page.tsx`) — left-aligned in the toolbar row above the
 * frame, not inside the frame itself.
 */
export default function LeadPhotosGalleryPage() {
  return (
    <Suspense fallback={null}>
      <LeadPhotosGalleryPageContent />
    </Suspense>
  );
}

function LeadPhotosGalleryPageContent() {
  const searchParams = useSearchParams();
  const loca = searchParams.get("loca");
  const leadName = searchParams.get("leadName");
  const [photosError, setPhotosError] = useState<string | null>(null);
  const photosRef = useRef<PhotosSectionHandle>(null);

  const detailsHref =
    leadName && loca
      ? `/dashboard/leads/details?leadName=${encodeURIComponent(leadName)}&leadLoca=${encodeURIComponent(loca)}`
      : "/dashboard/views?view=leads";

  if (!loca) {
    return (
      <DashboardPageShell title="Photos" upLevel={{ href: "/dashboard/views?view=leads", label: "Leads" }}>
        <ErrorBox message="Missing lead loca in the URL." />
      </DashboardPageShell>
    );
  }

  return (
    <DashboardPageShell
      title={leadName ? `${leadName} — Photos` : "Lead Photos"}
      upLevel={{ href: detailsHref, label: leadName ?? "Lead" }}
      contentClassName={FRAME_SECTION_GAP_CLASS}
    >
      <ErrorBox message={photosError} className="mb-0" />
      <div className="flex flex-wrap items-center gap-3">
        <Button
          variant="outline"
          size="sm"
          className="gap-2 h-7 text-xs"
          onClick={() => photosRef.current?.openFilePicker()}
        >
          <Plus className="h-3 w-3" />
          Add
        </Button>
      </div>
      <div className={LIST_ROW_WRAPPER_CLASS}>
        <PhotosSection
          ref={photosRef}
          basePath="/api/leads/photos"
          subjectParam="loca"
          subjectValue={loca}
          onError={setPhotosError}
          deleteHint="This only removes the CHAD-local copy attached to this lead."
          headingClassName="px-[10px] pt-1 pb-2 text-sm font-bold"
          variant="gallery"
        />
      </div>
    </DashboardPageShell>
  );
}

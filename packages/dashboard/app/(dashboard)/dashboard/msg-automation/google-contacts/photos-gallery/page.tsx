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
 * Full-page photo gallery for one Google Contact (Story 106 follow-up) —
 * same frame look as Knowledge's category pages (3 columns here instead
 * of 2), large tiles with empty placeholder cells. Not a separate
 * feature: reuses the same `PhotosSection` component and
 * `/api/google-contacts/photos` endpoints. The "+ Add" trigger is this
 * page's own button, styled exactly like Daily Tracker's
 * (`views/page.tsx`), left-aligned above the frame.
 */
export default function GoogleContactPhotosGalleryPage() {
  return (
    <Suspense fallback={null}>
      <GoogleContactPhotosGalleryPageContent />
    </Suspense>
  );
}

function GoogleContactPhotosGalleryPageContent() {
  const searchParams = useSearchParams();
  const resourceName = searchParams.get("resourceName");
  const displayName = searchParams.get("displayName");
  const [photosError, setPhotosError] = useState<string | null>(null);
  const photosRef = useRef<PhotosSectionHandle>(null);

  if (!resourceName) {
    return (
      <DashboardPageShell
        title="Photos"
      >
        <ErrorBox message="Missing contact resourceName in the URL." />
      </DashboardPageShell>
    );
  }

  return (
    <DashboardPageShell
      title={displayName ? `${displayName} — Photos` : "Contact Photos"}
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
          basePath="/api/google-contacts/photos"
          subjectParam="resourceName"
          subjectValue={resourceName}
          onError={setPhotosError}
          deleteHint="This only removes the CHAD-local copy — it never changes anything in Google Contacts."
          headingClassName="px-[10px] pt-1 pb-2 text-sm font-bold"
          variant="gallery"
        />
      </div>
    </DashboardPageShell>
  );
}

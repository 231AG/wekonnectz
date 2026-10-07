import { MobileScreen, ScreenLead, ScreenTitle } from "@/components/layout/mobile-screen";
import { PhotosManager } from "@/components/onboarding/photos-manager";
import { StepHeader } from "@/components/ui/step-header";
import { requireOnboardingStep } from "@/lib/auth/session";
import {
  completePhotoUpload,
  continueFromPhotos,
  makeMainPhoto,
  refreshPhotos,
  removePhoto,
  requestPhotoUpload,
} from "@/lib/photos/actions";
import { listOwnPhotos, photoLimits } from "@/lib/storage/photos";

export const metadata = { title: "Photos" };

/** Spec §10 step 9 (mock-up 06). Upload pipeline: spec §11. */
export default async function PhotosStepPage() {
  const member = await requireOnboardingStep("photos");
  const [photos, limits] = await Promise.all([listOwnPhotos(member.id), photoLimits()]);
  return (
    <MobileScreen>
      <StepHeader step={6} total={8} backHref="/onboarding/interests" />
      <ScreenTitle>Add your photos</ScreenTitle>
      <ScreenLead>
        {limits.required} required, up to {limits.max}. Your first photo must clearly show your face.
      </ScreenLead>
      <PhotosManager
        initialPhotos={photos}
        required={limits.required}
        max={limits.max}
        actions={{
          requestUpload: requestPhotoUpload,
          completeUpload: completePhotoUpload,
          makeMain: makeMainPhoto,
          remove: removePhoto,
          refresh: refreshPhotos,
          continueStep: continueFromPhotos,
        }}
      />
    </MobileScreen>
  );
}

"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { Camera, Lock, RotateCcw } from "lucide-react";

import { FormError } from "@/components/layout/mobile-screen";
import { Button } from "@/components/ui/button";
import { putToSignedUrl } from "@/lib/images/prepare-upload";
import type { SelfieState } from "@/lib/verification/actions";

type Stage = "starting" | "live" | "captured" | "blocked" | "unsupported";

/**
 * In-app camera capture (spec §9: camera, not gallery). There is deliberately no file input. The
 * image is taken from the live camera stream; the server still validates and re-encodes it, and a
 * person checks it against the pose.
 */
function SelfieCapture({
  verificationId,
  prepare,
  send,
}: {
  verificationId: string;
  prepare: (id: string) => Promise<{ uploadUrl?: string; error?: string }>;
  send: (id: string) => Promise<SelfieState>;
}) {
  const video = useRef<HTMLVideoElement>(null);
  const stream = useRef<MediaStream | null>(null);
  const [stage, setStage] = useState<Stage>("starting");
  const [shot, setShot] = useState<{ blob: Blob; url: string } | null>(null);
  const [error, setError] = useState<string>();
  const [sending, startSending] = useTransition();
  // Set on unmount: a camera stream that arrives afterwards (permission answered late) is stopped.
  const unmounted = useRef(false);

  async function startCamera() {
    setError(undefined);
    setStage("starting");
    if (!navigator.mediaDevices?.getUserMedia) {
      setStage("unsupported");
      return;
    }
    try {
      const media = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "user", width: { ideal: 1280 }, height: { ideal: 1280 } },
        audio: false,
      });
      if (unmounted.current) {
        media.getTracks().forEach((t) => t.stop());
        return;
      }
      stream.current = media;
      if (video.current) {
        video.current.srcObject = media;
        await video.current.play().catch(() => undefined);
      }
      setStage("live");
    } catch {
      setStage("blocked");
    }
  }

  useEffect(() => {
    unmounted.current = false;
    // Starting the camera on mount sets state once the browser answers the permission prompt.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void startCamera();
    return () => {
      unmounted.current = true;
      stream.current?.getTracks().forEach((t) => t.stop());
      stream.current = null;
    };
  }, []);

  function capture() {
    const v = video.current;
    if (!v || !v.videoWidth) return;
    const canvas = document.createElement("canvas");
    canvas.width = v.videoWidth;
    canvas.height = v.videoHeight;
    canvas.getContext("2d")?.drawImage(v, 0, 0);
    canvas.toBlob(
      (blob) => {
        if (!blob) return;
        setShot({ blob, url: URL.createObjectURL(blob) });
        setStage("captured");
        stream.current?.getTracks().forEach((t) => t.stop());
      },
      "image/jpeg",
      0.9,
    );
  }

  function retake() {
    if (shot) URL.revokeObjectURL(shot.url);
    setShot(null);
    void startCamera();
  }

  function submit() {
    if (!shot) return;
    startSending(async () => {
      setError(undefined);
      try {
        const { uploadUrl, error: prepError } = await prepare(verificationId);
        if (!uploadUrl) {
          setError(prepError);
          return;
        }
        const outcome = await putToSignedUrl(uploadUrl, shot.blob);
        if (outcome !== "ok") {
          setError("The selfie didn’t upload. Check your connection and try again.");
          return;
        }
        const result = await send(verificationId);
        if (result?.error) setError(result.error);
      } catch (e) {
        // redirect() from the server action surfaces as a navigation, not an error to show.
        if (e && typeof e === "object" && "digest" in e) throw e;
        setError("Something went wrong. Try again.");
      }
    });
  }

  return (
    <>
      <div className="relative flex aspect-[350/330] items-center justify-center overflow-hidden rounded-card border border-border bg-surface-1">
        {stage === "captured" && shot ? (
          // A local preview of the picture just taken (blob URL); nothing is uploaded yet.
          // eslint-disable-next-line @next/next/no-img-element
          <img src={shot.url} alt="Your selfie" className="size-full -scale-x-100 object-cover" />
        ) : (
          <video
            ref={video}
            playsInline
            muted
            aria-label="Camera preview"
            className={`size-full -scale-x-100 object-cover ${stage === "live" ? "" : "invisible"}`}
          />
        )}
        {stage !== "captured" ? (
          <div
            aria-hidden
            className="pointer-events-none absolute inset-y-[12%] left-1/2 aspect-[3/4] -translate-x-1/2 rounded-[50%] border-2 border-dashed border-pending"
          />
        ) : null}
        {stage === "starting" ? (
          <p className="absolute flex flex-col items-center gap-2 text-sm text-muted-foreground">
            <Camera className="size-7" strokeWidth={1.6} aria-hidden />
            Starting camera…
          </p>
        ) : null}
        {stage === "unsupported" ? (
          <p role="alert" className="absolute max-w-[260px] text-center text-sm text-muted-foreground">
            This browser can’t open the camera. Open WeKonnectz in Chrome, Safari or Firefox on your phone.
          </p>
        ) : null}
        {stage === "blocked" ? (
          <div className="absolute flex max-w-[260px] flex-col items-center gap-3 text-center text-sm text-muted-foreground">
            <Camera className="size-7" strokeWidth={1.6} aria-hidden />
            <p role="alert">
              We need your camera to verify you. Allow camera access for this site in your browser settings, then try
              again.
            </p>
            <Button variant="secondary" size="md" onClick={() => void startCamera()}>
              Try again
            </Button>
          </div>
        ) : null}
      </div>

      <p className="flex items-start gap-2.5 text-sm text-muted-foreground">
        <Lock className="mt-0.5 size-[18px] shrink-0" strokeWidth={1.8} aria-hidden />
        Private. Only reviewers see this selfie — never your profile.
      </p>
      <FormError>{error}</FormError>

      <div className="flex-1" />
      {stage === "captured" ? (
        <div className="flex flex-col gap-3">
          <Button onClick={submit} disabled={sending}>
            {sending ? "Sending…" : "Send for review"}
          </Button>
          <Button variant="outline" onClick={retake} disabled={sending}>
            <RotateCcw className="size-5" strokeWidth={1.8} aria-hidden /> Retake
          </Button>
        </div>
      ) : (
        <Button onClick={capture} disabled={stage !== "live"}>
          <Camera className="size-5" strokeWidth={1.8} aria-hidden /> Take selfie
        </Button>
      )}
    </>
  );
}

export { SelfieCapture };

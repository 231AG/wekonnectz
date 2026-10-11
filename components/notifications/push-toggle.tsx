"use client";

import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { deletePushSubscription, pushEndpointIsMine, savePushSubscription } from "@/lib/notifications/actions";

type State = "checking" | "unsupported" | "blocked" | "off" | "on" | "working";

function keyBytes(base64url: string): Uint8Array<ArrayBuffer> {
  const pad = "=".repeat((4 - (base64url.length % 4)) % 4);
  const raw = atob((base64url + pad).replace(/-/g, "+").replace(/_/g, "/"));
  const out = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i += 1) out[i] = raw.charCodeAt(i);
  return out;
}

/** Turns web push on or off for this browser (OD-25). The texts shown on the phone never name anyone. */
function PushToggle({ publicKey }: { publicKey: string }) {
  const [state, setState] = useState<State>("checking");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) {
        if (!cancelled) setState("unsupported");
        return;
      }
      if (Notification.permission === "denied") {
        if (!cancelled) setState("blocked");
        return;
      }
      const reg = await navigator.serviceWorker.getRegistration("/");
      const sub = await reg?.pushManager.getSubscription();
      // "On" only if this browser is registered to the member signed in now, not to an earlier user.
      const mine = sub ? await pushEndpointIsMine(sub.endpoint) : false;
      if (!cancelled) setState(mine ? "on" : "off");
    })().catch(() => !cancelled && setState("unsupported"));
    return () => {
      cancelled = true;
    };
  }, []);

  async function turnOn() {
    setError(null);
    setState("working");
    try {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setState(permission === "denied" ? "blocked" : "off");
        return;
      }
      const reg = await navigator.serviceWorker.register("/sw.js", { scope: "/" });
      await navigator.serviceWorker.ready;
      // A subscription left by someone who used this phone before is replaced, never reused.
      await (await reg.pushManager.getSubscription())?.unsubscribe();
      const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(publicKey) });
      const result = await savePushSubscription(sub.toJSON());
      if (!result.ok) {
        await sub.unsubscribe();
        setError(result.error ?? "Try again.");
        setState("off");
        return;
      }
      setState("on");
    } catch {
      setError("Couldn’t turn notifications on in this browser.");
      setState("off");
    }
  }

  async function turnOff() {
    setError(null);
    setState("working");
    const reg = await navigator.serviceWorker.getRegistration("/");
    const sub = await reg?.pushManager.getSubscription();
    if (sub) {
      await deletePushSubscription(sub.endpoint);
      await sub.unsubscribe();
    }
    setState("off");
  }

  return (
    <div className="flex flex-col gap-2" data-testid="push-toggle">
      {state === "unsupported" ? (
        <p className="text-[15px] text-muted-foreground">
          This browser can’t show notifications. On iPhone, add WeKonnectz to your Home Screen first.
        </p>
      ) : state === "blocked" ? (
        <p className="text-[15px] text-muted-foreground">
          Notifications are blocked for this site. Allow them in your browser settings, then come back.
        </p>
      ) : state === "on" ? (
        <Button variant="outline" onClick={turnOff}>
          Turn off on this phone
        </Button>
      ) : (
        <Button onClick={turnOn} disabled={state === "checking" || state === "working"}>
          Turn on phone notifications
        </Button>
      )}
      {state === "on" ? (
        <p className="text-[13px] text-muted-foreground">On for this phone. They never show names or message text.</p>
      ) : null}
      {error ? (
        <p role="alert" className="text-sm font-semibold text-danger">
          {error}
        </p>
      ) : null}
    </div>
  );
}

export { PushToggle };

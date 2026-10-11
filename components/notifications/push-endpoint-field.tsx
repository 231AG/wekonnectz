"use client";

import { useEffect, useState } from "react";

/**
 * Inside a sign-out form: sends this browser's push address, so signing out stops this phone getting
 * the member's notifications. Empty when push isn't on here.
 */
function PushEndpointField() {
  const [endpoint, setEndpoint] = useState("");
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    navigator.serviceWorker
      .getRegistration("/")
      .then((reg) => reg?.pushManager.getSubscription())
      .then((sub) => setEndpoint(sub?.endpoint ?? ""))
      .catch(() => setEndpoint(""));
  }, []);
  return <input type="hidden" name="pushEndpoint" value={endpoint} />;
}

export { PushEndpointField };

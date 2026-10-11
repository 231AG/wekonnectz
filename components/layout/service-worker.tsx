"use client";

import { useEffect } from "react";

/** Registers the app's service worker (offline screen, push). Production only: dev reloads constantly. */
function ServiceWorker() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production" || !("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch(() => {});
  }, []);
  return null;
}

export { ServiceWorker };

/* WeKonnectz web push (OD-25). Shows the notice the server sent (a generic title, text and link —
   never names or message text) and opens that screen when tapped. */
self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = {};
  }
  const title = typeof data.title === "string" ? data.title : "WeKonnectz";
  // Our own pages only: "/x", never "//other.site".
  const url = typeof data.url === "string" && /^\/(?!\/)/.test(data.url) ? data.url : "/home";
  event.waitUntil(
    self.registration.showNotification(title, {
      body: typeof data.body === "string" ? data.body : "",
      icon: "/brand/wekonnectz-heart.png",
      badge: "/brand/wekonnectz-heart.png",
      tag: typeof data.tag === "string" ? data.tag : undefined,
      data: { url },
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = new URL(event.notification.data?.url || "/home", self.location.origin).href;
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((windows) => {
      for (const w of windows) {
        if (w.url.startsWith(self.location.origin) && "focus" in w) {
          w.navigate(url);
          return w.focus();
        }
      }
      return self.clients.openWindow(url);
    }),
  );
});

import type { MetadataRoute } from "next";

/** Installable app (Phase 12 PWA): opens on Home, full screen, dark like the app. */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "WeKonnectz",
    short_name: "WeKonnectz",
    description: "Verified adults in Liberia. Something serious or something easy — on your terms.",
    id: "/",
    start_url: "/home",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#0D0D11",
    theme_color: "#0D0D11",
    icons: [
      { src: "/icons/icon-any-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-any-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "maskable" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}

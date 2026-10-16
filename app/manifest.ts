import type { MetadataRoute } from "next";
import { BP } from "@/lib/basepath";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "CalendlyIsDead",
    short_name: "CalendlyIsDead",
    description: "Free, open-source scheduling",
    start_url: BP + "/",
    scope: BP + "/",
    display: "standalone",
    background_color: "#ffffff",
    theme_color: "#006BFF",
    icons: [
      { src: BP + "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: BP + "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
    ],
  };
}

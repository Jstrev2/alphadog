import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "AlphaDog",
    short_name: "AlphaDog",
    description: "A live map of where dogs go.",
    start_url: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#f4f4f5",
    theme_color: "#065f46",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icons/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}

import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "CYA Hub",
    short_name: "CYA Hub",
    description: "Gestión privada de alumnado, clases, enseñanza y marketing de Carlos & Andy.",
    start_url: "/",
    display: "standalone",
    background_color: "#faf9fc",
    theme_color: "#6d4aff",
    lang: "es",
    orientation: "portrait-primary",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any maskable" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any maskable" },
    ],
  };
}

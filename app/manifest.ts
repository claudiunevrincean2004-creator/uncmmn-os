import type { MetadataRoute } from "next";

// Web app manifest — lets iOS "Add to Home Screen" and Android/desktop Chrome
// install Content OS as a standalone app with the star/sparkle icon.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Content OS",
    short_name: "Content OS",
    description: "Content operations — planning, production, review and delivery.",
    start_url: "/",
    display: "standalone",
    theme_color: "#0A0C12",      // midnight
    background_color: "#0A0C12", // midnight
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}

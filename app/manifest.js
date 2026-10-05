// Makes Huddle installable ("Add to Home Screen") so it opens full-screen like
// a normal app — and, on iPhone, is what allows push reminders at all.
export default function manifest() {
  return {
    name: "Huddle",
    short_name: "Huddle",
    description: "Your daily coaching dashboard",
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#121316",
    theme_color: "#121316",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}

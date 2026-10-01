import "./globals.css";

export const metadata = {
  title: "Huddle",
  description: "Your daily coaching dashboard",
};

export const viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="true" />
        <link
          href="https://fonts.googleapis.com/css2?family=Oswald:wght@500;600;700&family=Inter:wght@400;500;600;700&display=swap"
          rel="stylesheet"
        />
        {/* Applies a cached theme choice before first paint, so an explicit
            light/dark pick (Settings > Appearance) doesn't flash the wrong
            theme while the profile is still loading. "system" leaves no
            cached value, so this does nothing and prefers-color-scheme decides. */}
        <script
          dangerouslySetInnerHTML={{
            __html: `try{var t=localStorage.getItem('huddle-theme');if(t==='light'||t==='dark')document.documentElement.setAttribute('data-theme',t);}catch(e){}`,
          }}
        />
      </head>
      <body>{children}</body>
    </html>
  );
}

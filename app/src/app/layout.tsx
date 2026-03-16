import type { Metadata, Viewport } from "next";
import "./globals.css";

function MockBanner() {
  // MOCK_MODE is a server-only env var (not NEXT_PUBLIC) so it's evaluated at runtime
  if (process.env.MOCK_MODE !== "true") return null;
  return (
    <div className="bg-orange-500 text-white text-center text-xs py-1 font-medium">
      MOCK MODE — using fixture data, not live API
    </div>
  );
}

export const metadata: Metadata = {
  title: "Climbing Tracker",
  description: "Track USA Climbing competition results in real-time",
  manifest: "/manifest.json",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#1e40af",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="bg-gray-50 text-gray-900 antialiased min-h-screen">
        <header className="bg-blue-800 text-white shadow-md">
          <div className="max-w-5xl mx-auto px-4 py-3 flex items-center justify-between">
            <a href="/" className="text-xl font-bold tracking-tight">
              🧗 Climbing Tracker
            </a>
            <nav className="text-sm text-blue-200">
              <a href="/" className="hover:text-white">
                Competitions
              </a>
            </nav>
          </div>
        </header>
        <MockBanner />
        <main className="max-w-5xl mx-auto px-4 py-6">{children}</main>
      </body>
    </html>
  );
}

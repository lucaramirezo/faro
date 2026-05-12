import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { Badge } from "@/components/ui/badge";
import { getProfile } from "@/lib/profiles";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "faro",
  description: "Agent OS control center",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const profile = getProfile();
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} dark h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <nav className="border-b border-border bg-background/60 backdrop-blur sticky top-0 z-10">
          <div className="mx-auto max-w-6xl px-4 py-3 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold tracking-tight">faro/{profile.profile}</span>
              <Badge variant={profile.status === "active" ? "default" : "secondary"}>
                ● {profile.status}
              </Badge>
            </div>
            <span className="text-xs text-muted-foreground">v0.1</span>
          </div>
        </nav>
        <main className="mx-auto w-full max-w-6xl px-4 py-6 flex-1">{children}</main>
      </body>
    </html>
  );
}

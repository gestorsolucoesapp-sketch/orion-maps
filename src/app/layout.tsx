import type { Metadata } from "next";
import "./globals.css";
import AppVersion from "@/components/app-version";
import AppInteractions from "@/components/app-interactions";
import AutoUpdater from "@/components/auto-updater";

export const metadata: Metadata = {
  title: "Orion Maps",
  description: "Seus levantamentos com drone, do projeto ao mapa.",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    title: "Orion Maps",
    statusBarStyle: "black-translucent",
  },
  icons: {
    icon: "/orion-maps-logo.jpg",
    shortcut: "/orion-maps-logo.jpg",
    apple: "/orion-maps-logo.jpg",
  },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const build=process.env.VERCEL_GIT_COMMIT_SHA?.slice(0,7)||"local";
  return <html lang="pt-BR"><body><AppVersion/><AutoUpdater currentBuild={build}/><AppInteractions/>{children}</body></html>;
}

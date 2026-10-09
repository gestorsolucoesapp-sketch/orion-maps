import type { Metadata } from "next";
import { Space_Grotesk, Work_Sans } from "next/font/google";
import "./globals.css";
import AppVersion from "@/components/app-version";
import AppInteractions from "@/components/app-interactions";
import AutoUpdater from "@/components/auto-updater";
import AppNavigation from "@/components/app-navigation";

const workSans = Work_Sans({ subsets: ["latin"], display: "swap", variable: "--font-work-sans" });
const spaceGrotesk = Space_Grotesk({ subsets: ["latin"], display: "swap", variable: "--font-space-grotesk" });

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
  return <html lang="pt-BR" className={`${workSans.variable} ${spaceGrotesk.variable}`}><body><AppVersion/><AutoUpdater currentBuild={build}/><AppInteractions/><AppNavigation/>{children}</body></html>;
}

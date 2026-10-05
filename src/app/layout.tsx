import type { Metadata } from "next";
import "./globals.css";
import AppVersion from "@/components/app-version";
import AppInteractions from "@/components/app-interactions";

export const metadata: Metadata = {
  title: "Orion Maps",
  description: "Seus levantamentos com drone, do projeto ao mapa.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="pt-BR"><body><AppVersion/><AppInteractions/>{children}</body></html>;
}

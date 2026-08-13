import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import "./visual-audit-v21.css";
import "./visual-density-v22.css";
import "./evaluation-final-model.css";
import "./area-separation-v36.css";
import "./mobile-density-v37.css";
import "./p23-teaching.css";
import "./p0c-touch-targets.css";
import "./p0f-live-class.css";
import "./p0g-compact-ui.css";
import "./marketing-p29.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "CYA Hub",
  applicationName: "CYA Hub",
  description: "Gestión de alumnado, clases, enseñanza y marketing de Carlos & Andy.",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "CYA Hub",
  },
  formatDetection: {
    telephone: false,
  },
  other: {
    "codex-preview": "development",
  },
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
    apple: "/icon-192.png",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        {children}
      </body>
    </html>
  );
}

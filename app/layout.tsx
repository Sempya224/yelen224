import type { Metadata, Viewport } from "next";
import { Plus_Jakarta_Sans } from "next/font/google";
import "./globals.css";
import { ThemeProvider } from "@/components/ThemeProvider";
import { AuthSessionWatcher } from "@/components/AuthSessionWatcher";
import { SplashScreen } from "@/components/SplashScreen";

// Police de marque — remplace Geist, chargé jusqu'ici mais jamais appliqué
// (globals.css et le dashboard institution réécrivaient tous deux un
// font-family système à la place). Voir audit UI/UX niveau SaaS US,
// 12/07/2026.
const jakarta = Plus_Jakarta_Sans({
  variable: "--font-jakarta",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
});

export const viewport: Viewport = {
  themeColor: "#F5A623",
  viewportFit: "cover",
};

export const metadata: Metadata = {
  title: "Yelen224",
  description: "Votre rendez-vous, en un clic — La plateforme officielle de la République de Guinée",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Yelen224",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="fr" style={{ height: "100%" }}>
      <head>
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        <meta name="apple-mobile-web-app-title" content="Yelen224" />
        <link rel="apple-touch-icon" href="/icon-512.png" />
      </head>
      <body
        className={`${jakarta.variable} antialiased`}
        style={{ margin: 0, padding: 0, height: "100%" }}
      >
        <SplashScreen/>
        <ThemeProvider>
          <AuthSessionWatcher/>
          {children}
        </ThemeProvider>
      </body>
    </html>
  );
}
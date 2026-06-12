import type { Metadata } from "next";
import { JetBrains_Mono, Inter, Hind_Siliguri, Noto_Sans_Bengali } from "next/font/google";
import "./globals.css";

const jetbrainsMono = JetBrains_Mono({
  weight: ["400", "500", "600"],
  subsets: ["latin"],
  variable: "--font-jetbrains-mono",
  display: "swap",
});

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

const hindSiliguri = Hind_Siliguri({
  weight: ["400", "600", "700"],
  subsets: ["bengali", "latin"],
  variable: "--font-hind-siliguri",
  display: "swap",
});

const notoSansBengali = Noto_Sans_Bengali({
  weight: ["400", "500", "600", "700"],
  subsets: ["bengali"],
  variable: "--font-noto-bengali",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Imprnt AI — AI-Powered Brand Creative Direction",
  description:
    "Upload your brand guidelines and get complete on-brand campaign posters in under 60 seconds. Bangla and English supported.",
  keywords: ["brand design", "AI marketing", "Bangladesh", "Bangla", "campaign poster"],
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="en-BD"
      className={`${jetbrainsMono.variable} ${inter.variable} ${hindSiliguri.variable} ${notoSansBengali.variable}`}
    >
      <body>{children}</body>
    </html>
  );
}

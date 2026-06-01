"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { checkHealth } from "@/lib/api";
import type { HealthResponse } from "@/lib/types";
import styles from "./page.module.css";

export default function HomePage() {
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [healthError, setHealthError] = useState(false);

  useEffect(() => {
    checkHealth()
      .then(setHealth)
      .catch(() => setHealthError(true));
  }, []);

  return (
    <main className={styles.main}>
      {/* ── Background glow ── */}
      <div className={styles.bgGlow} aria-hidden="true" />

      {/* ── Nav ── */}
      <nav className={styles.nav}>
        <div className={styles.logo}>
          <span className={styles.logoMark}>⚡</span>
          <span className={styles.logoText}>Imprnt AI</span>
        </div>
        <div className={styles.navRight}>
          <div
            className={`${styles.statusBadge} ${
              healthError
                ? styles.statusError
                : health
                ? styles.statusOk
                : styles.statusLoading
            }`}
            title={healthError ? "Backend offline" : "Backend connected"}
          >
            <span className={styles.statusDot} />
            {healthError ? "Offline" : health ? "API Ready" : "Connecting…"}
          </div>
        </div>
      </nav>

      {/* ── Hero ── */}
      <section className={styles.hero}>
        <div className={styles.eyebrow}>
          AI BuildFest 2026 · Track 2: MarTech
        </div>

        <h1 className={styles.headline}>
          Brand intelligence.
          <br />
          <span className={styles.headlineAccent}>Campaign creatives.</span>
          <br />
          Under 60 seconds.
        </h1>

        <p className={styles.subheadline}>
          Upload your brand guidelines and get pixel-perfect, on-brand campaign
          posters in Bangla &amp; English — across three social media formats,
          in one click.
        </p>

        <div className={styles.ctaRow}>
          <Link href="/create" className={styles.ctaPrimary} id="cta-create">
            Start Creating
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
              <path d="M3 8h10M9 4l4 4-4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </Link>
        </div>

        {/* ── Bengali tagline ── */}
        <p className={`${styles.bnTagline} font-bn`}>
          আপনার ব্র্যান্ড, আমাদের AI — মুহূর্তেই পোস্টার।
        </p>
      </section>

      {/* ── Feature cards ── */}
      <section className={styles.features}>
        {features.map((f) => (
          <div key={f.title} className={styles.featureCard}>
            <div className={styles.featureIcon}>{f.icon}</div>
            <h3 className={styles.featureTitle}>{f.title}</h3>
            <p className={styles.featureDesc}>{f.desc}</p>
          </div>
        ))}
      </section>

      {/* ── API status strip ── */}
      {health && (
        <div className={styles.apiStrip}>
          Backend v{health.version} · {health.environment} · ✅ connected
        </div>
      )}
    </main>
  );
}

const features = [
  {
    icon: "🧠",
    title: "AI Creative Director",
    desc: "Gemini 2.5 Pro reads your brand guidelines and writes a complete design blueprint — strategy, layout, copy, and color direction.",
  },
  {
    icon: "🎨",
    title: "Hybrid Compositor",
    desc: "Cloudflare Workers AI generates the background. Puppeteer renders pixel-perfect typography in Bangla and English. Text never goes through an image model.",
  },
  {
    icon: "📐",
    title: "Three Formats, One Click",
    desc: "Instagram Post (1:1), Instagram Story (9:16), and Facebook Cover (16:9) — all generated simultaneously with layout reflowed for each aspect ratio.",
  },
];

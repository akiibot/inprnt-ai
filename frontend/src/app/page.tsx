"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Brain, Palette, LayoutGrid, ChevronRight } from "lucide-react";
import { checkHealth } from "@/lib/api";
import type { HealthResponse } from "@/lib/types";
import styles from "./page.module.css";

const DEMO_BRANDS = [
  { slug: "livana",     name: "Livana",        color: "#32774A" },
  { slug: "volt-bd",    name: "Volt BD",        color: "#FF4B00" },
  { slug: "aether",     name: "Aether Mobile",  color: "#64FFDA" },
];

export default function HomePage() {
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [healthError, setHealthError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    checkHealth()
      .then((data) => { if (!cancelled) setHealth(data); })
      .catch(() => { if (!cancelled) setHealthError(true); });
    return () => { cancelled = true; };
  }, []);

  return (
    <main className={styles.main}>
      <div className={styles.bgGlow} aria-hidden="true" />

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
            aria-label={healthError ? "Backend offline" : health ? "Backend connected" : "Backend connecting"}
            aria-live="polite"
          >
            <span className={styles.statusDot} />
            {healthError ? "Offline" : health ? "API Ready" : "Connecting…"}
          </div>
        </div>
      </nav>

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
            <ChevronRight size={18} aria-hidden="true" />
          </Link>
        </div>

        <div className={styles.demoSection}>
          <span className={styles.demoSectionLabel}>or try a demo brand</span>
          <div className={styles.demoBrandRow}>
            {DEMO_BRANDS.map((b) => (
              <Link key={b.slug} href={`/create?demo=${b.slug}`} className={styles.demoBrandBtn}>
                <span className={styles.demoBrandDot} style={{ background: b.color }} />
                {b.name}
              </Link>
            ))}
          </div>
        </div>

        <p className={`${styles.bnTagline} font-bn`} lang="bn">
          আপনার ব্র্যান্ড, আমাদের AI — মুহূর্তেই পোস্টার।
        </p>
      </section>

      <section className={styles.features} aria-label="How it works">
        {features.map((f, i) => {
          const Icon = f.icon;
          return (
            <div key={f.title} className={styles.featureRow}>
              <div className={styles.featureIndex}>
                <span className={styles.featureNum} aria-hidden="true">
                  0{i + 1}
                </span>
                <span className={styles.featureIconWrap} aria-hidden="true">
                  <Icon size={18} strokeWidth={1.5} />
                </span>
              </div>
              <div className={styles.featureBody}>
                <h2 className={styles.featureTitle}>{f.title}</h2>
                <p className={styles.featureDesc}>{f.desc}</p>
              </div>
            </div>
          );
        })}
      </section>

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
    icon: Brain,
    title: "AI Creative Director",
    desc: "Gemini 2.5 Pro reads your brand guidelines and writes a complete design blueprint — strategy, layout, copy, and color direction.",
  },
  {
    icon: Palette,
    title: "Hybrid Compositor",
    desc: "Cloudflare Workers AI generates the background. Puppeteer renders pixel-perfect typography in Bangla and English. Text never goes through an image model.",
  },
  {
    icon: LayoutGrid,
    title: "Three Formats, One Click",
    desc: "Instagram Post (1:1), Instagram Story (9:16), and Facebook Cover (16:9) — all generated simultaneously with layout reflowed for each aspect ratio.",
  },
];

"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { Play } from "lucide-react";
import { checkHealth } from "@/lib/api";
import type { HealthResponse } from "@/lib/types";
import styles from "./page.module.css";

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

  const apiStatus = healthError ? "offline" : health ? "online" : "connecting";

  return (
    <main className={styles.main}>
      {/* ── Top bar ── */}
      <div className={styles.topBar}>
        <span className={styles.topBarBrand}>Imprnt.AI</span>
        <div className={styles.apiBadge} data-status={apiStatus}>
          <span className={styles.apiBadgeDot} />
          API {healthError ? "Offline" : health ? "Online" : "…"}
        </div>
      </div>

      {/* ── Hero ── */}
      <section className={styles.hero}>
        {/* Grid lines */}
        <div className={styles.gridLines} aria-hidden="true">
          <span /><span /><span /><span />
        </div>

        {/* Left: headline + CTA */}
        <div className={styles.heroLeft}>
          <h1 className={styles.headline}>
            <span className={styles.headlineLine}>Brand Intelligence</span>
            <span className={styles.headlineLine}>Campaign Creatives</span>
            <span className={`${styles.headlineLine} ${styles.headlineAccent}`}>Within Few Minutes</span>
          </h1>
          <p className={styles.subheadline}>
            Upload your brand guidelines and get pixel-perfect, on-brand campaign
            posters in Bangla &amp; English — across three social media formats, in one click.
          </p>
          <div className={styles.ctaRow}>
            <Link href="/create" className={styles.ctaPrimary}>
              Start Creating
            </Link>
          </div>

          <div className={styles.demoBlock}>
            <div className={styles.demoSeparator}>
              <span className={styles.demoSeparatorText}>OR TRY A LIVE DEMO</span>
            </div>
            <Link href="/create?demo=upload" className={styles.ctaDemo}>
              <Play size={15} fill="currentColor" />
              Try Demo
            </Link>
            <p className={styles.demoHint}>
              Use our sample brand files — results in under 3 seconds
            </p>
          </div>
        </div>

        {/* Right: fingerprint illustration */}
        <div className={styles.heroRight}>
          <div className={styles.fingerprintFrame}>
            <Image
              src="/illustrations/fingerprint.png"
              alt="Brand identity illustration"
              fill
              className={styles.fingerprintImg}
              unoptimized
            />
          </div>
        </div>
      </section>

      {/* ── Horizontal divider ── */}
      <div className={styles.divider} aria-hidden="true" />

      {/* ── Features banner ── */}
      <div className={styles.featuresBanner}>
        <span>Features</span>
      </div>

      {/* ── Features grid ── */}
      <section className={styles.featuresGrid} aria-label="How it works">
        {/* Column 1: AI Creative Director */}
        <div className={styles.featureCol}>
          <div className={styles.featureImgWrap}>
            <Image
              src="/illustrations/brain.png"
              alt="Neural network brain illustration"
              fill
              className={styles.featureImg}
              unoptimized
            />
          </div>
          <div className={styles.featureText}>
            <h2 className={styles.featureTitle}>AI Creative Director</h2>
            <p className={styles.featureDesc}>
              Gemini 2.5 Pro reads your brand guidelines and writes a complete
              implementation blueprint — strategy, layout, copy, motion and color direction.
            </p>
          </div>
        </div>

        {/* Column divider */}
        <div className={styles.featureColDivider} aria-hidden="true" />

        {/* Column 2: Hybrid Compositor */}
        <div className={styles.featureCol}>
          <div className={styles.featureImgWrap}>
            <Image
              src="/illustrations/portrait.png"
              alt="Human silhouette with AI overlay"
              fill
              className={styles.featureImg}
              unoptimized
            />
            {/* Overlaid brand icons */}
            <div className={styles.brandIconOverlay1}>
              <Image src="/illustrations/brand-icon-1.png" alt="" fill unoptimized />
            </div>
            <div className={styles.brandIconOverlay2}>
              <Image src="/illustrations/brand-icon-2.png" alt="" fill unoptimized />
            </div>
          </div>
          <div className={styles.featureText}>
            <h2 className={styles.featureTitle}>Hybrid Compositor</h2>
            <p className={styles.featureDesc}>
              Cloudflare Workers AI generates the background. Puppeteer renders
              pixel-perfect typography in Bangla and English. Text never goes through an image model.
            </p>
          </div>
        </div>

        {/* Column divider */}
        <div className={styles.featureColDivider} aria-hidden="true" />

        {/* Column 3: Three Formats */}
        <div className={styles.featureCol}>
          <div className={styles.featureImgWrap}>
            <div className={styles.formatsIllustration}>
              <div className={styles.formatsTopRow}>
                <div className={styles.formatRect916}><span>9:16</span></div>
                <div className={styles.formatRect11}><span>1:1</span></div>
              </div>
              <div className={styles.formatRect169}><span>16:9</span></div>
              <div className={styles.cursorIcon}>
                <svg width="48" height="52" viewBox="0 0 87 93" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <g filter="url(#filter0_n_15_80)">
                    <path d="M3.80095e-06 -1.63013e-05L86.5922 44.8229L44.8108 53.4627L30.2145 92.8411L3.80095e-06 -1.63013e-05Z" fill="#F5F2EC"/>
                    <path d="M77.6997 43.5978L44.2032 50.5247L42.5758 50.8612L41.9981 52.4199L30.3981 83.7129L5.11489 6.02612L77.6997 43.5978Z" stroke="#3D3B37" strokeWidth="6"/>
                  </g>
                  <defs>
                    <filter id="filter0_n_15_80" x="0" y="0" width="86.5922" height="92.8412" filterUnits="userSpaceOnUse" colorInterpolationFilters="sRGB">
                      <feFlood floodOpacity="0" result="BackgroundImageFix"/>
                      <feBlend mode="normal" in="SourceGraphic" in2="BackgroundImageFix" result="shape"/>
                      <feTurbulence type="fractalNoise" baseFrequency="2 2" stitchTiles="stitch" numOctaves="3" result="noise" seed="1842"/>
                      <feColorMatrix in="noise" type="luminanceToAlpha" result="alphaNoise"/>
                      <feComponentTransfer in="alphaNoise" result="coloredNoise1">
                        <feFuncA type="discrete" tableValues="0 0 0 0 0 0 0 0 0 0 1 1 1 1 1 1 1 1 1 1 1 1 1 1 1 1 1 1 1 1 1 1 1 1 1 1 1 1 1 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0"/>
                      </feComponentTransfer>
                      <feComposite operator="in" in2="shape" in="coloredNoise1" result="noise1Clipped"/>
                      <feFlood floodColor="#FF7658" result="color1Flood"/>
                      <feComposite operator="in" in2="noise1Clipped" in="color1Flood" result="color1"/>
                      <feMerge result="effect1_noise_15_80">
                        <feMergeNode in="shape"/>
                        <feMergeNode in="color1"/>
                      </feMerge>
                    </filter>
                  </defs>
                </svg>
              </div>
            </div>
          </div>
          <div className={styles.featureText}>
            <h2 className={styles.featureTitle}>Three Formats, One Click</h2>
            <p className={styles.featureDesc}>
              Instagram Post (1:1), Instagram Story (9:16), and Facebook Cover (16:9)
              — all generated simultaneously with layout reflowed for each aspect ratio.
            </p>
          </div>
        </div>
      </section>

      {/* ── Footer ── */}
      <footer className={styles.footer}>
        AI BuildFest 2026 · Track 2: MarTech &nbsp;|&nbsp; Team Breaking BRAC
      </footer>
    </main>
  );
}

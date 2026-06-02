"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { Download, ArrowLeft } from "lucide-react";
import styles from "./page.module.css";

interface CampaignData {
  id: string;
  brand_id: string;
  campaign_name: string;
  campaign_strategy: string;
  adherence_level: string;
  language: string;
  poster_1x1_url?: string;
  poster_9x16_url?: string;
  poster_16x9_url?: string;
  background_url?: string;
  generation_time_seconds?: number;
  model_used?: string;
  blueprint?: {
    campaign_strategy?: string;
    background?: { prompt?: string };
    layers?: Array<{ id: string; type: string; content?: string; z_index: number }>;
  };
}

const API_BASE = `${process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000"}/api`;

export default function CampaignPage({ params }: { params: { id: string } }) {
  const [campaign, setCampaign] = useState<CampaignData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch(`${API_BASE}/campaigns/${params.id}`)
      .then((r) => {
        if (!r.ok) throw new Error(`Campaign not found (${r.status})`);
        return r.json();
      })
      .then(setCampaign)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [params.id]);

  const posters = campaign
    ? [
        { label: "Instagram Post", ar: "1:1", url: campaign.poster_1x1_url, cls: styles.posterImage1x1 },
        { label: "Instagram Story", ar: "9:16", url: campaign.poster_9x16_url, cls: styles.posterImage9x16 },
        { label: "Facebook Cover", ar: "16:9", url: campaign.poster_16x9_url, cls: styles.posterImage16x9 },
      ].filter((p) => p.url)
    : [];

  const layers = [...(campaign?.blueprint?.layers ?? [])].sort((a, b) => a.z_index - b.z_index);

  return (
    <main className={styles.page}>
      <div className={styles.inner}>
        <Link href="/" className={styles.backLink}>
          <ArrowLeft size={14} />
          Back to home
        </Link>

        {loading && <p className={styles.stateText}>Loading campaign…</p>}
        {error && <p className={styles.errorText}>{error}</p>}

        {campaign && (
          <>
            <h1 className={styles.title}>{campaign.campaign_name}</h1>

            <div className={styles.chips}>
              <span className={`${styles.chip} ${styles.chipPrimary}`}>{campaign.adherence_level}</span>
              <span className={styles.chip}>{campaign.language}</span>
              {campaign.model_used && <span className={styles.chip}>{campaign.model_used}</span>}
              {campaign.generation_time_seconds != null && (
                <span className={styles.chip}>{campaign.generation_time_seconds}s</span>
              )}
            </div>

            <section className={styles.section}>
              <h2 className={styles.sectionTitle}>Campaign Strategy</h2>
              <p className={styles.sectionBody}>
                {campaign.campaign_strategy || campaign.blueprint?.campaign_strategy || "—"}
              </p>
            </section>

            {campaign.blueprint?.background?.prompt && (
              <section className={styles.section}>
                <h2 className={styles.sectionTitle}>Flux Background Prompt</h2>
                <p className={styles.sectionBodyItalic}>{campaign.blueprint.background.prompt}</p>
              </section>
            )}

            {layers.length > 0 && (
              <section className={styles.section}>
                <h2 className={styles.sectionTitle}>Design Elements ({layers.length} layers)</h2>
                <div className={styles.layerList}>
                  {layers.map((l) => (
                    <div key={l.id} className={styles.layerRow}>
                      <span className={styles.layerTag}>{l.type}</span>
                      {l.content && <span className={styles.layerContent}>{l.content}</span>}
                    </div>
                  ))}
                </div>
              </section>
            )}

            {posters.length > 0 && (
              <section className={styles.section}>
                <h2 className={styles.sectionTitle}>Generated Posters</h2>
                <div className={styles.posterGrid}>
                  {posters.map((p) => (
                    <div key={p.ar} className={styles.posterCard}>
                      <div className={p.cls}>
                        <Image
                          src={p.url!}
                          alt={p.label}
                          fill
                          style={{ objectFit: "contain" }}
                          unoptimized
                        />
                      </div>
                      <div className={styles.posterFooter}>
                        <span className={styles.posterLabel}>{p.label}</span>
                        <a
                          href={p.url}
                          target="_blank"
                          rel="noreferrer"
                          className={styles.downloadLink}
                          aria-label={`Download ${p.label}`}
                        >
                          <Download size={14} />
                        </a>
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            )}
          </>
        )}
      </div>
    </main>
  );
}

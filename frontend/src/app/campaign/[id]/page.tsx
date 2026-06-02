"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { Download, ArrowLeft } from "lucide-react";

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

  const posters = campaign ? [
    { label: "Instagram Post", ar: "1:1", url: campaign.poster_1x1_url },
    { label: "Instagram Story", ar: "9:16", url: campaign.poster_9x16_url },
    { label: "Facebook Cover", ar: "16:9", url: campaign.poster_16x9_url },
  ].filter((p) => p.url) : [];

  const layers = campaign?.blueprint?.layers ?? [];

  return (
    <main style={{ minHeight: "100vh", background: "#080808", color: "white", padding: "2rem", fontFamily: "var(--font-inter, sans-serif)" }}>
      <div style={{ maxWidth: 1100, margin: "0 auto" }}>
        <Link href="/" style={{ display: "inline-flex", alignItems: "center", gap: 6, color: "#FF4B00", fontSize: 14, textDecoration: "none", marginBottom: "2rem" }}>
          <ArrowLeft size={14} /> Back to home
        </Link>

        {loading && <p style={{ color: "#666" }}>Loading campaign…</p>}
        {error && <p style={{ color: "red" }}>{error}</p>}

        {campaign && (
          <>
            <h1 style={{ fontFamily: "var(--font-anton, Anton, sans-serif)", fontSize: 40, letterSpacing: "0.02em", marginBottom: "0.5rem" }}>
              {campaign.campaign_name}
            </h1>
            <div style={{ display: "flex", gap: 12, marginBottom: "2rem", flexWrap: "wrap" }}>
              <Chip label={campaign.adherence_level} color="#FF4B00" />
              <Chip label={campaign.language} color="#555" />
              {campaign.model_used && <Chip label={campaign.model_used} color="#333" />}
              {campaign.generation_time_seconds != null && (
                <Chip label={`${campaign.generation_time_seconds}s`} color="#222" />
              )}
            </div>

            {/* Strategy */}
            <Section title="Campaign Strategy">
              <p style={{ fontSize: 15, color: "#aaa", lineHeight: 1.7 }}>
                {campaign.campaign_strategy || campaign.blueprint?.campaign_strategy || "—"}
              </p>
            </Section>

            {/* Flux background prompt */}
            {campaign.blueprint?.background?.prompt && (
              <Section title="Flux Background Prompt">
                <p style={{ fontSize: 14, color: "#888", fontStyle: "italic", lineHeight: 1.6 }}>
                  {campaign.blueprint.background.prompt}
                </p>
              </Section>
            )}

            {/* Layer list */}
            {layers.length > 0 && (
              <Section title={`Design Elements (${layers.length} layers)`}>
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  {[...layers].sort((a, b) => a.z_index - b.z_index).map((l) => (
                    <div key={l.id} style={{ display: "flex", alignItems: "baseline", gap: 10, fontSize: 13 }}>
                      <span style={{ background: "rgba(255,75,0,0.15)", color: "#FF4B00", padding: "1px 7px", borderRadius: 3, fontFamily: "monospace", fontSize: 12, whiteSpace: "nowrap" }}>
                        {l.type}
                      </span>
                      {l.content && <span style={{ color: "#888", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 500 }}>{l.content}</span>}
                    </div>
                  ))}
                </div>
              </Section>
            )}

            {/* Posters */}
            {posters.length > 0 && (
              <Section title="Generated Posters">
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 20 }}>
                  {posters.map((p) => (
                    <div key={p.ar} style={{ background: "#111", border: "1px solid #222", borderRadius: 8, overflow: "hidden" }}>
                      <div style={{ position: "relative", aspectRatio: p.ar.replace(":", "/"), background: "#000" }}>
                        <Image src={p.url!} alt={p.label} fill style={{ objectFit: "contain" }} unoptimized />
                      </div>
                      <div style={{ padding: "10px 12px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                        <span style={{ fontSize: 13, fontWeight: 600 }}>{p.label}</span>
                        <a href={p.url} target="_blank" rel="noreferrer" style={{ color: "#FF4B00" }}>
                          <Download size={16} />
                        </a>
                      </div>
                    </div>
                  ))}
                </div>
              </Section>
            )}
          </>
        )}
      </div>
    </main>
  );
}

function Chip({ label, color }: { label: string; color: string }) {
  return (
    <span style={{ fontSize: 11, fontWeight: 600, letterSpacing: "0.06em", textTransform: "uppercase", padding: "3px 10px", borderRadius: 999, background: color, color: "white" }}>
      {label}
    </span>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section style={{ marginBottom: "2rem" }}>
      <h2 style={{ fontSize: 12, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: "#FF4B00", marginBottom: "0.75rem" }}>
        {title}
      </h2>
      {children}
    </section>
  );
}

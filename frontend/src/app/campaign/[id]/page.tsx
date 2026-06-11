"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { Download, ArrowLeft, Video, Loader2, Play, Check } from "lucide-react";
import styles from "./page.module.css";
import { planCampaignVideo, generateCampaignVideo } from "@/lib/api";
import type { VeoPlan } from "@/lib/types";

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

type VideoStep = "idle" | "planning" | "rendering" | "done" | "error";

const API_BASE = `${process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000"}/api`;

export default function CampaignPage({ params }: { params: { id: string } }) {
  const router = useRouter();
  const [campaign, setCampaign] = useState<CampaignData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Video state
  const [videoStep, setVideoStep] = useState<VideoStep>("idle");
  const [, setVideoPlan] = useState<VeoPlan | null>(null);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [videoError, setVideoError] = useState<string | null>(null);
  const [videoElapsed, setVideoElapsed] = useState<number | null>(null);
  const [videoTimer, setVideoTimer] = useState(0);

  useEffect(() => {
    let cancelled = false;
    fetch(`${API_BASE}/campaigns/${params.id}`)
      .then((r) => {
        if (!r.ok) throw new Error(`Campaign not found (${r.status})`);
        return r.json();
      })
      .then((data) => { if (!cancelled) setCampaign(data); })
      .catch((e) => { if (!cancelled) setError(e.message); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [params.id]);

  // Elapsed timer while rendering
  useEffect(() => {
    if (videoStep !== "rendering") { setVideoTimer(0); return; }
    const t = setInterval(() => setVideoTimer((s) => s + 1), 1000);
    return () => clearInterval(t);
  }, [videoStep]);

  const handleGenerateVideo = async () => {
    if (!campaign) return;
    setVideoError(null);
    setVideoUrl(null);
    setVideoPlan(null);

    const isDemo = campaign.model_used === "demo";
    const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));
    const startTime = Date.now();

    try {
      // Step 1 — plan
      setVideoStep("planning");
      const planPromise = planCampaignVideo(campaign.id, "1:1");
      if (isDemo) await sleep(1300 + Math.random() * 400); // 1.3–1.7s
      const { veo_plan } = await planPromise;
      setVideoPlan(veo_plan);

      // Step 2 — generate
      setVideoStep("rendering");
      const genPromise = generateCampaignVideo(campaign.id, veo_plan, "1:1");
      if (isDemo) await sleep(3200 + Math.random() * 500); // 3.2–3.7s
      const result = await genPromise;

      setVideoUrl(result.video_url);
      // Show real wall-clock time (includes delay) so the UI matches what user felt
      setVideoElapsed(isDemo ? (Date.now() - startTime) / 1000 : result.generation_time_seconds);
      setVideoStep("done");
    } catch (e: unknown) {
      setVideoError(e instanceof Error ? e.message : String(e));
      setVideoStep("error");
    }
  };

  const posters = campaign
    ? [
        { label: "Instagram Post",  ar: "1:1",  url: campaign.poster_1x1_url,  cls: styles.posterImage1x1 },
        { label: "Instagram Story", ar: "9:16", url: campaign.poster_9x16_url, cls: styles.posterImage9x16 },
        { label: "Facebook Cover",  ar: "16:9", url: campaign.poster_16x9_url, cls: styles.posterImage16x9 },
      ].filter((p) => p.url)
    : [];

  const layers = [...(campaign?.blueprint?.layers ?? [])].sort((a, b) => a.z_index - b.z_index);

  return (
    <main className={styles.page}>
      <div className={styles.inner}>
        <button onClick={() => router.back()} className={styles.backLink}>
          <ArrowLeft size={14} />
          Back
        </button>

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

            {posters.length > 0 && (
              <section className={styles.section}>
                <h2 className={styles.sectionTitle}>Generated Posters</h2>
                <div className={styles.posterGrid}>
                  {posters.map((p) => (
                    <div key={p.ar} className={styles.posterCard}>
                      <div className={p.cls}>
                        <span className={styles.posterArBadge}>{p.ar}</span>
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

            <section className={styles.section}>
              <h2 className={styles.sectionTitle}>Campaign Strategy</h2>
              <p className={styles.sectionBody}>
                {campaign.campaign_strategy || campaign.blueprint?.campaign_strategy || "—"}
              </p>
            </section>

            {campaign.blueprint?.background?.prompt && (
              <section className={styles.section}>
                <h2 className={styles.sectionTitle}>Background</h2>
                <p className={styles.sectionBodyItalic}>{campaign.blueprint.background.prompt}</p>
              </section>
            )}

            {layers.length > 0 && (
              <section className={styles.section}>
                <h2 className={styles.sectionTitle}>Composition</h2>
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

            {/* ── Video Generator ── */}
            <section className={styles.section}>
              <h2 className={styles.sectionTitle}>Video</h2>

              {videoStep === "idle" && (
                <div className={styles.videoIdleCard}>
                  <div className={styles.videoIdleIcon}>
                    <Video size={32} strokeWidth={1.5} />
                  </div>
                  <p className={styles.videoIdleText}>
                    Generate an animated MP4 video from this campaign&apos;s poster.
                    Powered by Google Veo 3.1.
                  </p>
                  <button className={styles.videoGenBtn} onClick={handleGenerateVideo}>
                    <Play size={16} />
                    Generate Video
                  </button>
                </div>
              )}

              {(videoStep === "planning" || videoStep === "rendering") && (
                <div className={styles.videoProgressCard}>
                  <Loader2 size={28} className={styles.spinIcon} />
                  <div className={styles.videoProgressText}>
                    {videoStep === "planning"
                      ? "AI Director writing motion prompt…"
                      : `Veo 3.1 generating video… ${videoTimer}s`}
                  </div>
                  {videoStep === "rendering" && (
                    <p className={styles.videoProgressHint}>
                      AI video generation — typically 30–120s, up to 6 min at peak load
                    </p>
                  )}
                </div>
              )}

              {videoStep === "done" && videoUrl && (
                <div className={styles.videoResultCard}>
                  <div className={styles.videoResultHeader}>
                    <span className={styles.videoResultBadge}>
                      <Check size={13} /> Done in {videoElapsed?.toFixed(1)}s
                    </span>
                    <a
                      href={videoUrl}
                      download
                      target="_blank"
                      rel="noreferrer"
                      className={styles.videoDownloadBtn}
                    >
                      <Download size={14} /> Download MP4
                    </a>
                  </div>
                  <video
                    className={styles.videoPlayer}
                    src={videoUrl}
                    controls
                    autoPlay
                    loop
                    muted
                    playsInline
                  />
                  <button
                    className={styles.videoRegenBtn}
                    onClick={handleGenerateVideo}
                  >
                    Regenerate
                  </button>
                </div>
              )}

              {videoStep === "error" && (
                <div className={styles.videoErrorCard}>
                  <p className={styles.videoErrorText}>Video generation failed: {videoError}</p>
                  <button className={styles.videoGenBtn} onClick={handleGenerateVideo}>
                    Try Again
                  </button>
                </div>
              )}
            </section>
          </>
        )}
      </div>
    </main>
  );
}

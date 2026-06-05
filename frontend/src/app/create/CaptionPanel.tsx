"use client";
import { useState } from "react";
import { Copy, Check } from "lucide-react";
import type { CampaignCaptions } from "@/lib/types";

const platforms = [
  { key: "instagram" as const, label: "Instagram", icon: "📸" },
  { key: "facebook"  as const, label: "Facebook",  icon: "👥" },
  { key: "tiktok"    as const, label: "TikTok",    icon: "🎵" },
  { key: "caption_bn"as const, label: "বাংলা",     icon: "🇧🇩" },
];

export function CaptionPanel({ captions }: { captions: CampaignCaptions }) {
  const [copied, setCopied] = useState<string | null>(null);

  const handleCopy = async (key: string, text: string) => {
    await navigator.clipboard.writeText(
      key === "hashtags" ? captions.hashtags.join(" ") : text
    );
    setCopied(key);
    setTimeout(() => setCopied(null), 2000);
  };

  return (
    <div style={{
      background: "var(--color-bg-card)",
      border: "1px solid var(--color-border)",
      borderRadius: "var(--radius-lg)",
      padding: "var(--space-6)",
      marginTop: "var(--space-8)",
    }}>
      <h3 style={{
        fontFamily: "var(--font-heading-en)",
        fontSize: "18px",
        marginBottom: "var(--space-5)",
        color: "var(--color-white)",
      }}>
        ✍️ Brand-Voice Captions
      </h3>

      {platforms.map(({ key, label, icon }) => (
        <div key={key} style={{
          background: "var(--color-bg-elevated)",
          borderRadius: "var(--radius-md)",
          padding: "var(--space-4)",
          marginBottom: "var(--space-3)",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
          gap: "var(--space-4)",
        }}>
          <div style={{ flex: 1 }}>
            <div style={{
              fontSize: "12px",
              color: "var(--color-grey-400)",
              marginBottom: "var(--space-2)",
              textTransform: "uppercase",
              letterSpacing: "0.08em",
            }}>
              {icon} {label}
            </div>
            <p style={{
              color: "var(--color-white)",
              fontSize: "14px",
              lineHeight: "1.6",
              margin: 0,
              fontFamily: key === "caption_bn"
                ? "var(--font-heading-bn)"
                : "var(--font-body-en)",
            }}>
              {captions[key]}
            </p>
          </div>
          <button
            onClick={() => handleCopy(key, captions[key])}
            style={{
              background: "transparent",
              border: "1px solid var(--color-border)",
              borderRadius: "var(--radius-sm)",
              padding: "var(--space-2)",
              cursor: "pointer",
              color: copied === key
                ? "var(--color-primary)"
                : "var(--color-grey-400)",
              flexShrink: 0,
            }}
          >
            {copied === key ? <Check size={14} /> : <Copy size={14} />}
          </button>
        </div>
      ))}

      <div style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        marginTop: "var(--space-2)",
        padding: "var(--space-3) var(--space-4)",
        background: "var(--color-primary-dim)",
        borderRadius: "var(--radius-md)",
      }}>
        <p style={{
          color: "var(--color-primary)",
          fontSize: "13px",
          margin: 0,
        }}>
          {captions.hashtags.join(" ")}
        </p>
        <button
          onClick={() => handleCopy("hashtags", "")}
          style={{
            background: "transparent",
            border: "none",
            cursor: "pointer",
            color: copied === "hashtags"
              ? "var(--color-primary)"
              : "var(--color-grey-400)",
          }}
        >
          {copied === "hashtags" ? <Check size={14} /> : <Copy size={14} />}
        </button>
      </div>
    </div>
  );
}

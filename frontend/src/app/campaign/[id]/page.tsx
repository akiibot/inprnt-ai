/**
 * Campaign result page — Phase 3+ will build this out fully.
 * Placeholder for Phase 0 scaffolding.
 */
export default function CampaignPage({ params }: { params: { id: string } }) {
  return (
    <main style={{
      minHeight: "100vh",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      flexDirection: "column",
      gap: "16px",
      fontFamily: "var(--font-inter, sans-serif)",
      color: "white",
      background: "#080808"
    }}>
      <h1 style={{ fontFamily: "var(--font-anton)", fontSize: "48px" }}>
        Campaign
      </h1>
      <p style={{ color: "#999", fontSize: "16px" }}>
        ID: {params.id}
      </p>
      <p style={{ color: "#666", fontSize: "14px" }}>
        🚧 Phase 3 — Coming soon
      </p>
      <a href="/" style={{ color: "#FF4B00", fontSize: "14px" }}>
        ← Back to home
      </a>
    </main>
  );
}

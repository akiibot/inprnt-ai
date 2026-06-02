"use client";

import { useEffect } from "react";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <main
      style={{
        minHeight: "100vh",
        background: "var(--color-bg)",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: "1.5rem",
        fontFamily: "var(--font-body-en)",
        color: "var(--color-white)",
        padding: "2rem",
      }}
    >
      <h2 style={{ fontSize: "1.5rem", fontWeight: 700, color: "var(--color-primary)" }}>
        Something went wrong
      </h2>
      <p style={{ color: "var(--color-grey-400)", fontSize: "0.95rem", textAlign: "center", maxWidth: 400 }}>
        {error.message || "An unexpected error occurred."}
      </p>
      <button
        onClick={reset}
        style={{
          background: "var(--color-primary)",
          color: "var(--color-bg)",
          border: "none",
          borderRadius: "var(--radius-md)",
          padding: "0.75rem 2rem",
          fontSize: "0.95rem",
          fontWeight: 600,
          cursor: "pointer",
        }}
      >
        Try again
      </button>
    </main>
  );
}

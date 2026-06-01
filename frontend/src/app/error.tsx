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
        background: "#0A0A0A",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: "1.5rem",
        fontFamily: "Inter, sans-serif",
        color: "#fff",
        padding: "2rem",
      }}
    >
      <h2 style={{ fontSize: "1.5rem", fontWeight: 700, color: "#FF4B00" }}>
        Something went wrong
      </h2>
      <p style={{ color: "#999", fontSize: "0.95rem", textAlign: "center", maxWidth: 400 }}>
        {error.message || "An unexpected error occurred."}
      </p>
      <button
        onClick={reset}
        style={{
          background: "#FF4B00",
          color: "#fff",
          border: "none",
          borderRadius: "8px",
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

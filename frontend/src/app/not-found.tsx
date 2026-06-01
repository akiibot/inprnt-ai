import Link from "next/link";

export default function NotFound() {
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
        404 — Page not found
      </h2>
      <p style={{ color: "#999", fontSize: "0.95rem" }}>
        The page you&apos;re looking for doesn&apos;t exist.
      </p>
      <Link
        href="/"
        style={{
          background: "#FF4B00",
          color: "#fff",
          borderRadius: "8px",
          padding: "0.75rem 2rem",
          fontSize: "0.95rem",
          fontWeight: 600,
          textDecoration: "none",
        }}
      >
        Go home
      </Link>
    </main>
  );
}

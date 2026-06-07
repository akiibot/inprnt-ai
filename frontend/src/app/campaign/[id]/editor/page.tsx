import dynamic from "next/dynamic";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import type { AspectRatio } from "@/lib/types";
import styles from "./editor.module.css";

const ImageEditor = dynamic(
  () => import("@/components/editor/ImageEditor"),
  {
    ssr: false,
    loading: () => <div className={styles.loading}>Loading editor…</div>,
  }
);

interface EditorPageProps {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ ar?: string; url?: string }>;
}

export default async function EditorPage({ params, searchParams }: EditorPageProps) {
  const { id } = await params;
  const { ar, url } = await searchParams;

  const aspectRatio = (ar ?? "1:1") as AspectRatio;
  const posterUrl = url ? decodeURIComponent(url) : "";

  return (
    <div className={styles.editorLayout}>
      <nav className={styles.editorNav}>
        <Link href={`/campaign/${id}`} className={styles.backLink}>
          <ArrowLeft size={14} />
          Back to Campaign
        </Link>
        <span className={styles.editorDivider}>·</span>
        <span className={styles.editorTitle}>Image Editor — {aspectRatio}</span>
      </nav>
      <ImageEditor
        campaignId={id}
        aspectRatio={aspectRatio}
        posterUrl={posterUrl}
      />
    </div>
  );
}

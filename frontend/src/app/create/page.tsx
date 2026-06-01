"use client";

import React, { useState, useRef, useEffect } from "react";
import Image from "next/image";
import { UploadCloud, Check, ChevronRight, Loader2, Play, Download } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import styles from "./create.module.css";
import { uploadBrand, uploadProductImage, planCampaign, generateCampaign, exportCampaignFormats } from "@/lib/api";
import type { ExportResult } from "@/lib/types";

// Multi-step form state
type Step = "UPLOAD_BRAND" | "UPLOAD_PRODUCT" | "PROMPT" | "GENERATING" | "RESULTS";

export default function CreateCampaign() {
  const [currentStep, setCurrentStep] = useState<Step>("UPLOAD_BRAND");
  const [logs, setLogs] = useState<string[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);

  // Files
  const [brandPdf, setBrandPdf] = useState<File | null>(null);
  const [brandLogo, setBrandLogo] = useState<File | null>(null);
  const [productImage, setProductImage] = useState<File | null>(null);
  const [prompt, setPrompt] = useState("");
  const [results, setResults] = useState<ExportResult[]>([]);

  const brandInputRef = useRef<HTMLInputElement>(null);
  const logoInputRef = useRef<HTMLInputElement>(null);
  const productInputRef = useRef<HTMLInputElement>(null);
  const logsEndRef = useRef<HTMLDivElement>(null);

  // Auto-scroll logs
  useEffect(() => {
    logsEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [logs]);

  const addLog = (msg: string) => {
    const time = new Date().toLocaleTimeString([], { hour12: false });
    setLogs((prev) => [...prev, `[${time}] ${msg}`]);
  };

  const handleNext = () => {
    if (currentStep === "UPLOAD_BRAND") setCurrentStep("UPLOAD_PRODUCT");
    else if (currentStep === "UPLOAD_PRODUCT") setCurrentStep("PROMPT");
    else if (currentStep === "PROMPT") handleGenerate();
  };

  const handleGenerate = async () => {
    if (!brandPdf || !brandLogo || !prompt.trim()) return;

    setCurrentStep("GENERATING");
    setIsProcessing(true);
    setLogs([]);
    setResults([]);

    try {
      // 1. Upload Brand
      addLog("Phase 1/5: Uploading brand guidelines and logo...");
      const brandRes = await uploadBrand(brandPdf, brandLogo);
      const brandId = brandRes.brand_id;
      addLog(`✅ Brand extracted via Gemini: ${brandRes.brand.brand_name}`);

      // 2. Upload Product (Optional)
      if (productImage) {
        addLog("Phase 2/5: Stripping background from Product Image via Remove.bg...");
        await uploadProductImage(brandId, productImage);
        addLog("✅ Product background removed & saved.");
      } else {
        addLog("Phase 2/5: Skipped (no product image).");
      }

      // 3. Plan Campaign
      addLog("Phase 3/5: Calling Gemini 2.5 Pro to design Campaign Blueprint...");
      const planRes = await planCampaign({
        brand_id: brandId,
        prompt: prompt,
        adherence_level: "moderate",
        product_image_available: !!productImage,
        format: {
          name: "1:1 Post",
          width: 1080,
          height: 1080,
          aspect_ratio: "1:1"
        }
      });
      addLog(`✅ Blueprint created: ${planRes.blueprint.campaign_name}`);

      // 4. Generate Primary Format & Background
      addLog("Phase 4/5: Generating background (Cloudflare Flux) and rendering HTML...");
      const genRes = await generateCampaign(planRes.blueprint);
      addLog("✅ Background generated and 1:1 primary poster rendered.");

      const campaignId = genRes.campaign_id;

      // 5. Export Other Formats
      addLog("Phase 5/5: Auto-cropping AI background for 9:16 and 16:9 exports...");
      const exportRes = await exportCampaignFormats({
        campaign_id: campaignId,
        formats: [
          { name: "1:1 Post", width: 1080, height: 1080, aspect_ratio: "1:1" },
          { name: "9:16 Story", width: 1080, height: 1920, aspect_ratio: "9:16" },
          { name: "16:9 Cover", width: 1920, height: 1080, aspect_ratio: "16:9" }
        ]
      });
      addLog("✅ All formats rendered perfectly.");

      setResults(exportRes.exports);
      addLog("Pipeline Complete! 🎉");

    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      addLog('ERROR: ' + message);
      if (err && typeof err === 'object' && 'detail' in err) {
        addLog('Details: ' + JSON.stringify(err.detail));
      }
    } finally {
      setIsProcessing(false);
      setCurrentStep("RESULTS");
    }
  };

  const steps = ["UPLOAD_BRAND", "UPLOAD_PRODUCT", "PROMPT", "GENERATING", "RESULTS"];
  const stepIndex = steps.indexOf(currentStep);

  return (
    <div className={styles.container}>
      <header className={styles.header}>
        <h1 className={styles.title}>New Campaign</h1>
        <p className={styles.subtitle}>AI-powered creative direction and execution.</p>
      </header>

      {/* Stepper */}
      <div className={styles.stepper}>
        {[1, 2, 3, 4, 5].map((step, idx) => (
          <div
            key={step}
            className={`${styles.step} ${
              stepIndex === idx ? styles.stepActive : ""
            } ${stepIndex > idx ? styles.stepCompleted : ""}`}
          >
            {stepIndex > idx ? <Check size={20} /> : step}
          </div>
        ))}
      </div>

      <AnimatePresence mode="wait">
        <motion.div
          key={currentStep}
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -20 }}
          transition={{ duration: 0.3 }}
          className={styles.content}
        >
          {/* STEP 1 */}
          {currentStep === "UPLOAD_BRAND" && (
            <div>
              <h2 className={styles.cardTitle}>1. Brand Identity</h2>
              <div className={styles.inputGroup}>
                <label className={styles.label}>Brand Guidelines (PDF)</label>
                <div
                  className={styles.uploadZone}
                  onClick={() => brandInputRef.current?.click()}
                >
                  <UploadCloud className={styles.uploadIcon} />
                  <p>{brandPdf ? brandPdf.name : "Click to upload brand_guidelines.pdf"}</p>
                </div>
                <input
                  type="file"
                  ref={brandInputRef}
                  className={styles.fileInput}
                  accept=".pdf"
                  onChange={(e) => setBrandPdf(e.target.files?.[0] || null)}
                />
              </div>

              <div className={styles.inputGroup}>
                <label className={styles.label}>Brand Logo (PNG/SVG)</label>
                <div
                  className={styles.uploadZone}
                  onClick={() => logoInputRef.current?.click()}
                >
                  <UploadCloud className={styles.uploadIcon} />
                  <p>{brandLogo ? brandLogo.name : "Click to upload transparent logo"}</p>
                </div>
                <input
                  type="file"
                  ref={logoInputRef}
                  className={styles.fileInput}
                  accept="image/png, image/svg+xml"
                  onChange={(e) => setBrandLogo(e.target.files?.[0] || null)}
                />
              </div>

              <div className={styles.actions}>
                <button
                  className={`${styles.button} ${styles.buttonPrimary}`}
                  onClick={handleNext}
                  disabled={!brandPdf || !brandLogo}
                >
                  Next Step <ChevronRight size={18} />
                </button>
              </div>
            </div>
          )}

          {/* STEP 2 */}
          {currentStep === "UPLOAD_PRODUCT" && (
            <div>
              <h2 className={styles.cardTitle}>2. Product Focus (Optional)</h2>
              <p style={{ color: "var(--color-grey-400)", marginBottom: "var(--space-6)" }}>
                Upload an image of the product. Our AI will automatically remove the background.
              </p>

              <div className={styles.inputGroup}>
                <div
                  className={styles.uploadZone}
                  onClick={() => productInputRef.current?.click()}
                >
                  <UploadCloud className={styles.uploadIcon} />
                  <p>{productImage ? productImage.name : "Click to upload product image"}</p>
                </div>
                <input
                  type="file"
                  ref={productInputRef}
                  className={styles.fileInput}
                  accept="image/*"
                  onChange={(e) => setProductImage(e.target.files?.[0] || null)}
                />
              </div>

              <div className={styles.actions}>
                <button className={styles.button} onClick={() => setCurrentStep("UPLOAD_BRAND")}>
                  Back
                </button>
                <button
                  className={`${styles.button} ${styles.buttonPrimary}`}
                  onClick={handleNext}
                >
                  Next Step <ChevronRight size={18} />
                </button>
              </div>
            </div>
          )}

          {/* STEP 3 */}
          {currentStep === "PROMPT" && (
            <div>
              <h2 className={styles.cardTitle}>3. Campaign Prompt</h2>
              <p style={{ color: "var(--color-grey-400)", marginBottom: "var(--space-4)" }}>
                Describe the campaign goals, vibe, and any specific requirements. Gemini 2.5 Pro will handle the creative direction.
              </p>

              <div className={styles.inputGroup}>
                <textarea
                  className={styles.textarea}
                  placeholder="e.g. Design an Eid Special Edition Launch. It should leverage Eid celebrations to position the brand as the energy drink of festive gatherings..."
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                />
              </div>

              <div className={styles.actions}>
                <button className={styles.button} onClick={() => setCurrentStep("UPLOAD_PRODUCT")}>
                  Back
                </button>
                <button
                  className={`${styles.button} ${styles.buttonPrimary}`}
                  onClick={handleNext}
                  disabled={!prompt.trim()}
                >
                  <Play size={18} /> Generate Campaign
                </button>
              </div>
            </div>
          )}

          {/* STEP 4 */}
          {currentStep === "GENERATING" && (
            <div>
              <h2 className={styles.cardTitle}>
                <Loader2 className="animate-spin" size={24} style={{ color: "var(--color-primary)" }}/>
                Processing Pipeline...
              </h2>

              <div className={styles.terminal}>
                {logs.map((log, i) => (
                  <div key={i} className={styles.logLine}>{log}</div>
                ))}
                {isProcessing && (
                  <div className={styles.logLine} style={{ opacity: 0.7 }}>
                    <span className="animate-pulse">_</span>
                  </div>
                )}
                <div ref={logsEndRef} />
              </div>
            </div>
          )}

          {/* STEP 5 */}
          {currentStep === "RESULTS" && (
            <div>
              <h2 className={styles.cardTitle} style={{ color: "var(--color-primary)" }}>
                <Check size={28} /> Campaign Generated!
              </h2>
              <p style={{ color: "var(--color-grey-400)", marginBottom: "var(--space-6)" }}>
                AI &quot;A&quot; crafted the blueprint. AI &quot;B&quot; generated the background. Playwright rendered the typography perfectly.
              </p>

              <div className={styles.resultsGrid}>
                {results.map((res, i) => (
                  <div key={i} className={styles.resultCard}>
                    <div className={`${styles.resultImageWrapper} ${
                      res.aspect_ratio === '9:16' ? styles.resultImageWrapper9x16 :
                      res.aspect_ratio === '16:9' ? styles.resultImageWrapper16x9 :
                      styles.resultImageWrapper1x1
                    }`}>
                      <Image
                        src={res.url}
                        alt={res.format_name}
                        fill
                        className={styles.resultImage}
                        unoptimized
                      />
                    </div>
                    <div className={styles.resultFooter}>
                      <span className={styles.resultFormat}>{res.format_name}</span>
                      <a href={res.url} target="_blank" rel="noreferrer" className={styles.button} style={{padding: 'var(--space-2)'}}>
                        <Download size={16}/>
                      </a>
                    </div>
                  </div>
                ))}
                {results.length === 0 && (
                   <div style={{color:'red'}}>Pipeline failed. Check logs.</div>
                )}
              </div>

              <div className={styles.actions} style={{ marginTop: "var(--space-10)" }}>
                <button
                  className={styles.button}
                  onClick={() => {
                    setCurrentStep("UPLOAD_BRAND");
                    setBrandPdf(null);
                    setBrandLogo(null);
                    setProductImage(null);
                    setPrompt("");
                  }}
                >
                  Start New Campaign
                </button>
              </div>
            </div>
          )}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}

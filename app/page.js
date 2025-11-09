"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";

// Plain JS version (no TS types). Tailwind + Framer Motion.
// Drop into `app/page.js`.
export default function Home() {
  const [file, setFile] = useState(null);
  const [previewUrl, setPreviewUrl] = useState(null);
  const [loading, setLoading] = useState(false);
  const [log, setLog] = useState("");
  const [progressHint, setProgressHint] = useState("");

  const workerUrlRef = useRef(
    process.env.NEXT_PUBLIC_WORKER_URL || "http://localhost:8080/process"
  );

  const fileInfo = useMemo(() => {
    if (!file) return "";
    const mb = (file.size / (1024 * 1024)).toFixed(1);
    const ext = file.name.split(".").pop();
    return `${file.name} • ${mb} MB${ext ? ` • .${ext.toLowerCase()}` : ""}`;
  }, [file]);

  useEffect(() => {
    if (!file) {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
      setPreviewUrl(null);
      return;
    }
    const url = URL.createObjectURL(file);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  function onDrop(e) {
    e.preventDefault();
    e.stopPropagation();
    const f = e.dataTransfer.files?.[0];
    if (f) pickFile(f);
  }
  function onDragOver(e) {
    e.preventDefault();
    e.stopPropagation();
  }

  function pickFile(f) {
    if (!f.type.startsWith("video/")) {
      setLog("❌ Please select a video file.");
      return;
    }
    const MAX = 500 * 1024 * 1024; // 500MB soft cap
    if (f.size > MAX) {
      setLog("⚠️ File is larger than 500MB. Try a shorter clip.");
    } else {
      setLog("");
    }
    setFile(f);
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!file || loading) return;

    setLoading(true);
    setLog("Uploading… This can take a moment for larger files.");
    setProgressHint("Initializing background removal…");

    try {
      const fd = new FormData();
      fd.append("video", file);

      const res = await fetch(`http://localhost:8080/process`, {
        method: "POST",
        body: fd,
      });

      if (!res.ok) {
        let msg = `Worker error: ${res.status}`;
        try {
          const j = await res.json();
          msg = j.error || msg;
        } catch {}
        throw new Error(msg);
      }

      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = file.name.replace(/\.[^/.]+$/, "") + "_ai_nobg.mp4";
      a.click();
      URL.revokeObjectURL(url);

      setLog("✅ Done! Your download has started.");
      setProgressHint("");
    } catch (err) {
      setLog("❌ " + (err?.message || "Failed"));
      setProgressHint("");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="relative min-h-screen overflow-hidden bg-black text-white">
      {/* Animated background blobs */}
      <motion.div
        aria-hidden
        className="pointer-events-none absolute -top-32 -left-40 h-96 w-96 rounded-full blur-3xl"
        initial={{ opacity: 0.2, scale: 0.8 }}
        animate={{ opacity: 0.35, scale: 1 }}
        transition={{ duration: 2, ease: "easeOut" }}
        style={{
          background:
            "radial-gradient(closest-side, rgba(0,140,255,0.5), transparent)",
        }}
      />
      <motion.div
        aria-hidden
        className="pointer-events-none absolute -bottom-40 -right-32 h-[28rem] w-[28rem] rounded-full blur-3xl"
        initial={{ opacity: 0.2, scale: 0.8 }}
        animate={{ opacity: 0.4, scale: 1 }}
        transition={{ duration: 2.2, delay: 0.1, ease: "easeOut" }}
        style={{
          background:
            "radial-gradient(closest-side, rgba(0,255,204,0.45), transparent)",
        }}
      />

      {/* Center column */}
      <div className="relative z-10 mx-auto flex min-h-screen max-w-4xl flex-col items-center justify-center px-6 py-16">
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="w-full"
        >
          {/* Header */}

          <div className="mb-8 text-center">
            <h1 className="mb-3 bg-gradient-to-r from-cyan-300 via-sky-200 to-teal-200 bg-clip-text text-3xl font-bold text-transparent md:text-4xl">
              AI Video Background Remover
            </h1>
            <p className="text-sm text-white/70 md:text-base">
              Drop a clip or choose a file. We’ll remove the background and
              download your processed video.
            </p>
          </div>

          {/* Card */}
          <div className="group relative rounded-3xl border border-white/10 bg-white/5 p-6 shadow-2xl backdrop-blur-xl md:p-8">
            <div className="pointer-events-none absolute inset-0 rounded-3xl opacity-0 ring-1 ring-cyan-300/30 transition-opacity duration-300 group-hover:opacity-100" />

            <form onSubmit={handleSubmit} className="space-y-6">
              {/* Dropzone */}
              <label
                onDrop={onDrop}
                onDragOver={onDragOver}
                className="relative block cursor-pointer rounded-2xl border-2 border-dashed border-white/15 p-6 transition hover:border-white/25"
              >
                <input
                  type="file"
                  accept="video/*"
                  onChange={(e) => {
                    const f = e.target.files?.[0] || null;
                    if (f) pickFile(f);
                  }}
                  className="sr-only"
                />

                <div className="flex items-center gap-4">
                  <div className="grid h-14 w-14 place-items-center rounded-xl bg-white/10">
                    <motion.svg
                      initial={{ rotate: -6, scale: 0.95 }}
                      animate={{ rotate: 0, scale: 1 }}
                      transition={{
                        type: "spring",
                        stiffness: 200,
                        damping: 16,
                      }}
                      xmlns="http://www.w3.org/2000/svg"
                      viewBox="0 0 24 24"
                      fill="currentColor"
                      className="h-7 w-7 text-cyan-300"
                    >
                      <path d="M12 16a1 1 0 0 0 1-1V8.41l1.3 1.3a1 1 0 1 0 1.4-1.42l-3-3a1 1 0 0 0-1.4 0l-3 3A1 1 0 1 0 9.7 9.7L11 8.4V15a1 1 0 0 0 1 1Z" />
                      <path d="M4 15a4 4 0 0 1 4-4h.06A6 6 0 0 1 21 12a4 4 0 0 1-1 7H7a3 3 0 0 1-3-3Z" />
                    </motion.svg>
                  </div>

                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-white">
                      {file ? (
                        <span className="text-white/90">{fileInfo}</span>
                      ) : (
                        <span className="text-white/80">
                          Drag & drop your video here, or{" "}
                          <span className="underline">browse</span>
                        </span>
                      )}
                    </p>
                    <p className="mt-1 text-xs text-white/60">
                      Supported: common video formats (MP4, MOV, WEBM). Try a
                      short clip first (&lt; 30s) for faster results.
                    </p>
                  </div>
                </div>
              </label>

              {/* Preview */}
              <AnimatePresence>
                {previewUrl && (
                  <motion.div
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -6 }}
                    className="overflow-hidden rounded-2xl border border-white/10"
                  >
                    <video
                      src={previewUrl}
                      className="max-h-80 w-full object-contain bg-black/60"
                      controls
                    />
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Action row */}
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="text-xs text-white/60">
                  Endpoint:{" "}
                  <code className="text-white/80">{workerUrlRef.current}</code>
                </div>

                <motion.button
                  whileHover={{ y: -2 }}
                  whileTap={{ y: 0 }}
                  disabled={!file || loading}
                  className="relative inline-flex items-center justify-center gap-2 rounded-xl bg-gradient-to-br from-cyan-400 to-teal-400 px-5 py-2.5 font-semibold text-black shadow-lg shadow-cyan-900/20 transition enabled:hover:brightness-110 disabled:opacity-50"
                  type="submit"
                >
                  {loading && (
                    <motion.span
                      className="inline-block h-4 w-4 rounded-full border-2 border-black/50 border-t-transparent"
                      animate={{ rotate: 360 }}
                      transition={{
                        repeat: Infinity,
                        ease: "linear",
                        duration: 0.9,
                      }}
                    />
                  )}
                  {loading ? "Processing…" : "Remove Background"}
                </motion.button>
              </div>

              {/* Progress shimmer when loading */}
              <AnimatePresence>
                {loading && (
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="relative h-1.5 w-full overflow-hidden rounded-full bg-white/10"
                  >
                    <motion.span
                      className="absolute inset-y-0 left-0 w-1/3 rounded-full bg-gradient-to-r from-cyan-300 to-teal-300"
                      animate={{ x: ["0%", "200%"] }}
                      transition={{
                        repeat: Infinity,
                        duration: 1.4,
                        ease: "easeInOut",
                      }}
                    />
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Status / Tips */}
              <AnimatePresence>
                {(log || progressHint) && (
                  <motion.div
                    initial={{ opacity: 0, y: 4 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -4 }}
                    className="space-y-2 text-sm"
                  >
                    {log && (
                      <p className="text-white/85 whitespace-pre-wrap">{log}</p>
                    )}
                    {progressHint && (
                      <p className="text-white/65">{progressHint}</p>
                    )}
                    <p className="text-white/55 text-xs">
                      Tip: very long clips can take a while. Start small to
                      validate quality.
                    </p>
                  </motion.div>
                )}
              </AnimatePresence>
            </form>
          </div>
        </motion.div>
      </div>
    </div>
  );
}

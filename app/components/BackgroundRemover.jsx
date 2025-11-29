"use client";

import React, { useEffect, useRef, useState } from "react";
import { loadSegmenter } from "./segmentation";
import { startCanvasRecorder } from "./recorder";
import * as bodySegmentation from "@tensorflow-models/body-segmentation";
import { motion, AnimatePresence } from "framer-motion";

export default function BackgroundRemover() {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);

  const [file, setFile] = useState(null);
  const [previewUrl, setPreviewUrl] = useState(null);
  const [segmenter, setSegmenter] = useState(null);
  const [processing, setProcessing] = useState(false);
  const [loading, setLoading] = useState(false);
  const [log, setLog] = useState("");
  const [progressHint, setProgressHint] = useState("");

  // Load ML model once
  useEffect(() => {
    async function init() {
      setLog("Loading AI model…");
      try {
        const seg = await loadSegmenter();
        setSegmenter(seg);
        setLog("");
      } catch (err) {
        console.error(err);
        setLog("Failed to load model.");
      }
    }
    init();
  }, []);

  const fileInfo =
    file != null
      ? `${file.name} • ${(file.size / (1024 * 1024)).toFixed(1)} MB`
      : "";

  function pickFile(f) {
    if (!f) return;
    setFile(f);

    setPreviewUrl((old) => {
      if (old) URL.revokeObjectURL(old);
      return old;
    });

    const url = URL.createObjectURL(f);
    setPreviewUrl(url);

    if (videoRef.current) {
      videoRef.current.src = url;
      videoRef.current.load();
    }

    setLog("");
    setProgressHint("Ready to process. Click “Remove Background”.");
  }

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

  // 🔥 MAIN PIPELINE
  async function startProcessing() {
    if (!segmenter || !videoRef.current || !canvasRef.current || !file) return;

    const video = videoRef.current;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");

    // Ensure metadata is ready (so videoWidth / videoHeight are valid)
    if (!video.videoWidth || !video.videoHeight) {
      await new Promise((resolve, reject) => {
        const onLoaded = () => {
          video.removeEventListener("loadedmetadata", onLoaded);
          video.removeEventListener("error", onError);
          resolve();
        };
        const onError = (e) => {
          video.removeEventListener("loadedmetadata", onLoaded);
          video.removeEventListener("error", onError);
          reject(e);
        };
        video.addEventListener("loadedmetadata", onLoaded);
        video.addEventListener("error", onError);
      });
    }

    const W = video.videoWidth;
    const H = video.videoHeight;

    if (!W || !H) {
      console.error("Video has invalid dimensions", { W, H });
      return;
    }

    canvas.width = W;
    canvas.height = H;

    console.log("Video dims", W, H);
    console.log("Canvas dims", canvas.width, canvas.height);

    setProcessing(true);
    setLoading(true);
    setLog("Processing video frames…");
    setProgressHint(
      "Everything runs in your browser. Longer clips will take more time."
    );

    // 🎥 start recording the canvas
    const { stop } = startCanvasRecorder(canvas);

    let rafId = null;
    let lastMask = null;

    // Hard binary mask: white=person, transparent=background
    const foregroundColor = { r: 255, g: 255, b: 255, a: 255 }; // person
    const backgroundColor = { r: 0, g: 0, b: 0, a: 0 }; // transparent bg
    const foregroundThreshold = 0.6; // tweak 0.55–0.7 if hands still go missing

    // Per-frame processor
    async function processFrame() {
      if (video.paused || video.ended) return;

      if (video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) {
        rafId = requestAnimationFrame(processFrame);
        return;
      }

      try {
        // 1. Draw original frame
        ctx.drawImage(video, 0, 0, W, H);

        // 2. Run segmentation on the canvas
        const seg = await segmenter.segmentPeople(canvas);

        let maskImage = null;

        if (seg && seg.length > 0) {
          // Build binary mask with explicit threshold
          maskImage = await bodySegmentation.toBinaryMask(
            seg,
            foregroundColor,
            backgroundColor,
            false, // drawContour
            foregroundThreshold // 0.6: keeps more detail (hands)
          );
          lastMask = maskImage;
        } else if (lastMask) {
          // No seg this frame → reuse last good mask to avoid bg popping in
          maskImage = lastMask;
        } else {
          // No mask at all yet, just show original frame
          rafId = requestAnimationFrame(processFrame);
          return;
        }

        if (!maskImage) {
          rafId = requestAnimationFrame(processFrame);
          return;
        }

        // 3. Get current frame pixels
        const frame = ctx.getImageData(0, 0, W, H);
        const fp = frame.data;
        const mp = maskImage.data;

        // 4. Apply mask: keep subject, drop background
        // mp[i+3] is alpha: 255 = subject, 0 = background
        for (let i = 0; i < fp.length; i += 4) {
          const a = mp[i + 3];

          if (a === 0) {
            // background → transparent
            fp[i + 3] = 0;
          } else {
            // subject → fully opaque
            fp[i + 3] = 255;
          }
        }

        // 5. Draw result
        ctx.putImageData(frame, 0, 0);
      } catch (err) {
        console.error("Segmentation error, skipping frame:", err);
      }

      rafId = requestAnimationFrame(processFrame);
    }

    // Kick off processing
    video.currentTime = 0;
    await video.play();
    rafId = requestAnimationFrame(processFrame);

    // When the video ends, stop recording and download result
    video.onended = async () => {
      if (rafId) cancelAnimationFrame(rafId);

      try {
        const blob = await stop();
        const url = URL.createObjectURL(blob);

        const a = document.createElement("a");
        a.href = url;
        a.download = file.name.replace(/\.[^.]+$/, "") + "_nobg.webm";
        document.body.appendChild(a);
        a.click();
        a.remove();

        URL.revokeObjectURL(url);
        setLog("✅ Done! Downloaded processed video.");
        setProgressHint("");
      } catch (err) {
        console.error(err);
        setLog("❌ Failed to finalize recording.");
        setProgressHint("");
      } finally {
        setProcessing(false);
        setLoading(false);
      }
    };
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!file || loading) return;
    await startProcessing();
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
            <h1 className="mb-3 bg-linear-to-r from-cyan-300 via-sky-200 to-teal-200 bg-clip-text text-3xl font-bold text-transparent md:text-4xl">
              AI Video Background Remover
            </h1>
            <p className="text-sm text-white/70 md:text-base">
              Drop a clip or choose a file. We’ll remove the background and
              download your processed video — all on your device.
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
                      Supported: MP4, MOV, WEBM. Start with a short clip (&lt;
                      30s) for fastest results.
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
                      ref={videoRef}
                      src={previewUrl}
                      className="max-h-80 w-full object-contain bg-black/60"
                      controls
                    />
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Canvas */}
              <canvas
                ref={canvasRef}
                className="mt-4 w-full rounded-2xl bg-black/80"
              />

              {/* Action row */}
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <motion.button
                  whileHover={{ y: -2 }}
                  whileTap={{ y: 0 }}
                  disabled={!file || loading || !segmenter}
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
                  {loading
                    ? "Processing…"
                    : !segmenter
                    ? "Loading model…"
                    : "Remove Background"}
                </motion.button>
              </div>

              {/* Progress shimmer */}
              <AnimatePresence>
                {loading && (
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="relative h-1.5 w-full overflow-hidden rounded-full bg-white/10"
                  >
                    <motion.span
                      className="absolute inset-y-0 left-0 w-1/3 rounded-full bg-linear-to-r from-cyan-300 to-teal-300"
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

              {/* Status */}
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

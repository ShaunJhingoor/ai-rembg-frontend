// app/components/segmentation.js
import * as bodySegmentation from "@tensorflow-models/body-segmentation";
// 👇 side-effect import only – do NOT import { SelfieSegmentation }
import "@mediapipe/selfie_segmentation";

export async function loadSegmenter() {
  const model = bodySegmentation.SupportedModels.MediaPipeSelfieSegmentation;

  const segmenterConfig = {
    runtime: "mediapipe", // ✅ use mediapipe runtime
    solutionPath: "https://cdn.jsdelivr.net/npm/@mediapipe/selfie_segmentation", // CDN path
    modelType: "general", // or "landscape"
  };

  // This returns the segmenter; we NEVER call `new SelfieSegmentation` ourselves
  const segmenter = await bodySegmentation.createSegmenter(
    model,
    segmenterConfig
  );
  return segmenter;
}

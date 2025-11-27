// app/components/segmentation.js
import "@tensorflow/tfjs-backend-webgl"; // or "@tensorflow/tfjs" meta package
import * as bodySegmentation from "@tensorflow-models/body-segmentation";
// ^ no "@mediapipe/selfie_segmentation" import at all

export async function loadSegmenter() {
  const model = bodySegmentation.SupportedModels.MediaPipeSelfieSegmentation;

  const segmenterConfig = {
    runtime: "tfjs", // 👈 change from 'mediapipe' to 'tfjs'
    modelType: "general", // or 'landscape'
  };

  const segmenter = await bodySegmentation.createSegmenter(
    model,
    segmenterConfig
  );
  return segmenter;
}

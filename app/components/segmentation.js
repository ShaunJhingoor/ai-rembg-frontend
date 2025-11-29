// app/components/segmentation.js
import "@tensorflow/tfjs-backend-webgl";
import * as bodySegmentation from "@tensorflow-models/body-segmentation";

export async function loadSegmenter() {
  const model = bodySegmentation.SupportedModels.MediaPipeSelfieSegmentation;

  const segmenterConfig = {
    runtime: "tfjs",
    modelType: "general",
  };

  const segmenter = await bodySegmentation.createSegmenter(
    model,
    segmenterConfig
  );
  return segmenter;
}

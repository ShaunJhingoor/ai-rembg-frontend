export function startCanvasRecorder(canvas, fps = 30) {
  const stream = canvas.captureStream(fps);
  const recorder = new MediaRecorder(stream, { mimeType: "video/webm" });
  const chunks = [];

  recorder.ondataavailable = (e) => {
    if (e.data.size > 0) chunks.push(e.data);
  };

  recorder.start();

  return {
    stop: () =>
      new Promise((resolve) => {
        recorder.onstop = () =>
          resolve(new Blob(chunks, { type: "video/webm" }));
        recorder.stop();
      }),
  };
}

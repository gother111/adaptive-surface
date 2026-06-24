import { FilesetResolver, HandLandmarker } from "@mediapipe/tasks-vision";
import type { HandObservation, HandWorkerRequest } from "@/perception/hand/types";
import type { NormalizedLandmark } from "@/perception/hand/types";

let landmarker: HandLandmarker | null = null;

self.onmessage = async (event: MessageEvent<HandWorkerRequest>) => {
  const message = event.data;

  try {
    if (message.type === "init") {
      const fileset = await FilesetResolver.forVisionTasks(message.wasmBaseUrl);
      landmarker = await HandLandmarker.createFromOptions(fileset, {
        baseOptions: {
          modelAssetPath: message.modelAssetPath,
          delegate: "CPU",
        },
        runningMode: "VIDEO",
        numHands: message.numHands,
      });
      postMessage({ type: "ready" });
      return;
    }

    if (message.type === "shutdown") {
      landmarker?.close();
      landmarker = null;
      return;
    }

    if (message.type === "detect") {
      if (!landmarker) {
        message.frame.close?.();
        postMessage({ type: "error", message: "Hand model is not ready.", recoverable: true });
        return;
      }

      const startedAt = performance.now();
      const result = landmarker.detectForVideo(message.frame, message.envelope.capturedAt);
      message.frame.close?.();
      const landmarks = result.landmarks[0]?.map((point) => ({
        x: clamp01(point.x),
        y: clamp01(point.y),
        z: point.z,
      })) ?? [];
      const observation: HandObservation = {
        sequence: message.envelope.sequence,
        capturedAt: message.envelope.capturedAt,
        emittedAt: performance.now(),
        handPresent: landmarks.length > 0,
        handedness: parseHandedness(result.handednesses[0]?.[0]?.categoryName),
        trackingConfidence: null,
        boundingBox: landmarks.length ? bounds(landmarks) : null,
        landmarks,
      };
      postMessage({
        type: "observation",
        observation,
        inferenceDurationMs: performance.now() - startedAt,
      });
    }
  } catch (error) {
    if (message.type === "detect") {
      message.frame.close?.();
    }
    postMessage({ type: "error", message: error instanceof Error ? error.message : String(error), recoverable: message.type === "detect" });
  }
};

function parseHandedness(value: string | undefined) {
  if (value?.toLowerCase() === "left") return "left";
  if (value?.toLowerCase() === "right") return "right";
  return "unknown";
}

function bounds(landmarks: readonly NormalizedLandmark[]) {
  const xs = landmarks.map((point) => point.x);
  const ys = landmarks.map((point) => point.y);
  const minX = Math.min(...xs);
  const minY = Math.min(...ys);
  const maxX = Math.max(...xs);
  const maxY = Math.max(...ys);
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}

function clamp01(value: number) {
  return Math.min(1, Math.max(0, value));
}

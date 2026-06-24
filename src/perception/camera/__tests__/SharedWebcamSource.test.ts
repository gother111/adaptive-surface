import { describe, expect, it, vi } from "vitest";
import { SharedWebcamSource } from "@/perception/camera/SharedWebcamSource";

describe("SharedWebcamSource", () => {
  it("deduplicates concurrent startup into one getUserMedia call", async () => {
    const env = createCameraEnv();
    const source = new SharedWebcamSource(env.options);

    const [a, b] = await Promise.all([source.acquire("gaze"), source.acquire("hand")]);

    expect(env.getUserMedia).toHaveBeenCalledTimes(1);
    expect(a.stream).toBe(b.stream);
    expect(source.getSnapshot().activeConsumerIds).toEqual(["gaze", "hand"]);
  });

  it("keeps the track alive until the final consumer releases", async () => {
    const env = createCameraEnv();
    const source = new SharedWebcamSource(env.options);
    const gaze = await source.acquire("gaze");
    const hand = await source.acquire("hand");

    await gaze.release();
    expect(env.track.stop).not.toHaveBeenCalled();
    expect(source.getSnapshot().activeConsumerIds).toEqual(["hand"]);

    await hand.release();
    expect(env.track.stop).toHaveBeenCalledTimes(1);
    expect(source.getSnapshot().status).toBe("idle");
  });

  it("makes repeated release harmless", async () => {
    const env = createCameraEnv();
    const source = new SharedWebcamSource(env.options);
    const lease = await source.acquire("gaze");

    await lease.release();
    await lease.release();

    expect(env.track.stop).toHaveBeenCalledTimes(1);
  });

  it("shares startup failure and can recover on reacquire", async () => {
    const env = createCameraEnv();
    const denied = new DOMException("Denied", "NotAllowedError");
    env.getUserMedia.mockRejectedValueOnce(denied).mockResolvedValueOnce(env.stream);
    const source = new SharedWebcamSource(env.options);

    await expect(Promise.all([source.acquire("gaze"), source.acquire("hand")])).rejects.toThrow();
    expect(env.getUserMedia).toHaveBeenCalledTimes(1);
    expect(source.getSnapshot().status).toBe("permission-denied");

    const lease = await source.acquire("gaze");
    expect(lease.stream).toBe(env.stream);
    expect(env.getUserMedia).toHaveBeenCalledTimes(2);
  });

  it("opens a new stream after a full stop", async () => {
    const env = createCameraEnv();
    const second = createStream();
    env.getUserMedia.mockResolvedValueOnce(env.stream).mockResolvedValueOnce(second.stream);
    const source = new SharedWebcamSource(env.options);

    const firstLease = await source.acquire("gaze");
    await firstLease.release();
    const secondLease = await source.acquire("gaze");

    expect(env.getUserMedia).toHaveBeenCalledTimes(2);
    expect(secondLease.stream).toBe(second.stream);
  });

  it("marks the shared source ended when the track ends", async () => {
    const env = createCameraEnv();
    const source = new SharedWebcamSource(env.options);

    await source.acquire("gaze");
    env.endTrack();

    expect(source.getSnapshot().status).toBe("ended");
  });
});

function createCameraEnv() {
  const { stream, track, endTrack } = createStream();
  const getUserMedia = vi.fn().mockResolvedValue(stream);
  const video = {
    muted: false,
    autoplay: false,
    playsInline: false,
    tabIndex: 0,
    style: {},
    srcObject: null,
    play: vi.fn().mockResolvedValue(undefined),
    pause: vi.fn(),
    setAttribute: vi.fn(),
    remove: vi.fn(),
  } as unknown as HTMLVideoElement;

  return {
    stream,
    track,
    endTrack,
    getUserMedia,
    options: {
      mediaDevices: { getUserMedia } as unknown as MediaDevices,
      createVideo: () => video,
      appendVideo: vi.fn(),
      removeVideo: vi.fn(),
    },
  };
}

function createStream() {
  let endedListener: (() => void) | null = null;
  const track = {
    stop: vi.fn(),
    addEventListener: vi.fn((_event: string, listener: () => void) => {
      endedListener = listener;
    }),
    getSettings: () => ({ width: 1280, height: 720, frameRate: 30, deviceId: "camera-1" }),
  } as unknown as MediaStreamTrack;
  const stream = {
    getTracks: () => [track],
    getVideoTracks: () => [track],
  } as unknown as MediaStream;
  return { stream, track, endTrack: () => endedListener?.() };
}

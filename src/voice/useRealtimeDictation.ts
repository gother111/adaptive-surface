import { useEffect, useMemo, useRef } from "react";
import { useSurfaceStore } from "@/stores/useSurfaceStore";
import type { SpeechRecognition, SpeechRecognitionEvent } from "@/voice/speech-types";

export function useRealtimeDictation() {
  const recognitionRef = useRef<SpeechRecognition | null>(null);
  const sessionStartedAtRef = useRef<number | null>(null);
  const firstPartialReceivedRef = useRef(false);

  const listeningRequested = useSurfaceStore((state) => state.listeningRequested);
  const setListening = useSurfaceStore((state) => state.setListening);
  const setListeningRequested = useSurfaceStore((state) => state.setListeningRequested);
  const setVoiceRuntime = useSurfaceStore((state) => state.setVoiceRuntime);
  const receiveVoicePartial = useSurfaceStore((state) => state.receiveVoicePartial);
  const receiveVoiceFinal = useSurfaceStore((state) => state.receiveVoiceFinal);

  const SpeechRecognitionApi = useMemo(
    () => window.SpeechRecognition ?? window.webkitSpeechRecognition,
    [],
  );

  useEffect(() => {
    setVoiceRuntime({
      voiceSupported: Boolean(SpeechRecognitionApi),
      voiceProvider: SpeechRecognitionApi ? "web-speech" : "native-macos-planned",
      voiceError: SpeechRecognitionApi
        ? null
        : "No Web Speech provider is exposed in this webview. Add the native macOS Speech bridge next.",
    });
  }, [SpeechRecognitionApi, setVoiceRuntime]);

  useEffect(() => {
    if (!listeningRequested) {
      recognitionRef.current?.stop();
      setListening(false);
      return;
    }

    if (!SpeechRecognitionApi) {
      setListening(false);
      setListeningRequested(false);
      setVoiceRuntime({
        voiceProvider: "native-macos-planned",
        voiceError:
          "Dictation provider unavailable in this runtime. TODO: wire SFSpeechRecognizer through a native Tauri plugin, or add whisper.cpp/faster-whisper.",
      });
      return;
    }

    const recognition = new SpeechRecognitionApi();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = "en-US";

    recognition.onresult = (event) => handleSpeechResult(event);
    recognition.onerror = (event) => {
      setVoiceRuntime({ voiceError: `Voice recognition stopped: ${event.error}` });
      setListening(false);
      setListeningRequested(false);
    };
    recognition.onend = () => {
      setListening(false);
      if (useSurfaceStore.getState().listeningRequested) {
        // Web Speech can stop after silence. Restarting keeps continuous dictation alive.
        window.setTimeout(() => {
          if (useSurfaceStore.getState().listeningRequested) {
            try {
              recognition.start();
              setListening(true);
            } catch {
              setListeningRequested(false);
            }
          }
        }, 120);
      }
    };

    recognitionRef.current = recognition;
    sessionStartedAtRef.current = performance.now();
    firstPartialReceivedRef.current = false;
    setVoiceRuntime({ voiceError: null });

    try {
      recognition.start();
      setListening(true);
    } catch (error) {
      setVoiceRuntime({ voiceError: error instanceof Error ? error.message : "Failed to start dictation." });
      setListening(false);
      setListeningRequested(false);
    }

    function handleSpeechResult(event: SpeechRecognitionEvent) {
      let partial = "";

      for (let index = event.resultIndex; index < event.results.length; index += 1) {
        const result = event.results[index];
        const text = result[0]?.transcript.trim();

        if (!text) {
          continue;
        }

        if (result.isFinal) {
          receiveVoiceFinal(text);
        } else {
          partial = `${partial} ${text}`.trim();
        }
      }

      if (partial) {
        const latency = firstPartialReceivedRef.current
          ? null
          : Math.round(performance.now() - (sessionStartedAtRef.current ?? performance.now()));

        firstPartialReceivedRef.current = true;
        receiveVoicePartial(partial, latency);
      }
    }

    return () => {
      recognition.onresult = null;
      recognition.onerror = null;
      recognition.onend = null;
      recognition.abort();
      recognitionRef.current = null;
      setListening(false);
    };
  }, [
    SpeechRecognitionApi,
    listeningRequested,
    receiveVoiceFinal,
    receiveVoicePartial,
    setListening,
    setListeningRequested,
    setVoiceRuntime,
  ]);
}

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSurfaceStore } from "@/stores/useSurfaceStore";

interface SpeechRecognitionAlternative {
  transcript: string;
}

interface SpeechRecognitionResult {
  isFinal: boolean;
  0: SpeechRecognitionAlternative;
}

interface SpeechRecognitionResultList {
  length: number;
  item(index: number): SpeechRecognitionResult;
  [index: number]: SpeechRecognitionResult;
}

interface SpeechRecognitionEvent extends Event {
  resultIndex: number;
  results: SpeechRecognitionResultList;
}

interface SpeechRecognitionErrorEvent extends Event {
  error: string;
}

interface SpeechRecognition extends EventTarget {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  start: () => void;
  stop: () => void;
  abort: () => void;
  onresult: ((event: SpeechRecognitionEvent) => void) | null;
  onend: (() => void) | null;
  onerror: ((event: SpeechRecognitionErrorEvent) => void) | null;
}

interface SpeechRecognitionConstructor {
  new (): SpeechRecognition;
}

declare global {
  interface Window {
    SpeechRecognition?: SpeechRecognitionConstructor;
    webkitSpeechRecognition?: SpeechRecognitionConstructor;
  }
}

export function useSpeechRecognition() {
  const recognitionRef = useRef<SpeechRecognition | null>(null);
  const listening = useSurfaceStore((state) => state.listening);
  const setListening = useSurfaceStore((state) => state.setListening);
  const appendTranscript = useSurfaceStore((state) => state.appendTranscript);
  const [interimText, setInterimText] = useState("");
  const [error, setError] = useState<string | null>(null);

  const SpeechRecognitionApi = useMemo(
    () => window.SpeechRecognition ?? window.webkitSpeechRecognition,
    [],
  );

  const supported = Boolean(SpeechRecognitionApi);

  const stop = useCallback(() => {
    recognitionRef.current?.stop();
    setListening(false);
    setInterimText("");
  }, [setListening]);

  const start = useCallback(() => {
    if (!SpeechRecognitionApi) {
      setError("Web Speech API is not available in this runtime. Use a browser with speech recognition or connect a native speech bridge.");
      return;
    }

    const recognition = new SpeechRecognitionApi();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = "en-US";

    recognition.onresult = (event) => {
      let interim = "";

      for (let index = event.resultIndex; index < event.results.length; index += 1) {
        const result = event.results[index];
        const text = result[0]?.transcript.trim();

        if (!text) {
          continue;
        }

        if (result.isFinal) {
          appendTranscript(text);
          setInterimText("");
        } else {
          interim = `${interim} ${text}`.trim();
        }
      }

      setInterimText(interim);
    };

    recognition.onerror = (event) => {
      setError(`Voice recognition stopped: ${event.error}`);
      setListening(false);
    };

    recognition.onend = () => {
      setListening(false);
    };

    recognitionRef.current = recognition;
    setError(null);
    setListening(true);
    recognition.start();
  }, [SpeechRecognitionApi, appendTranscript, setListening]);

  const toggle = useCallback(() => {
    if (listening) {
      stop();
    } else {
      start();
    }
  }, [listening, start, stop]);

  useEffect(() => {
    return () => recognitionRef.current?.abort();
  }, []);

  return {
    supported,
    listening,
    interimText,
    error,
    start,
    stop,
    toggle,
  };
}

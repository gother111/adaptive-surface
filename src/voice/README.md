# Voice Providers

The current provider is the lowest-latency Phase 1 path available from the
frontend runtime: Web Speech with interim results. It streams partial text into
Zustand immediately, where the synchronous intent classifier creates a draft
surface in the same frame.

Next provider:

- Add a native macOS Tauri plugin around `SFSpeechRecognizer` and `AVAudioEngine`.
- Emit `dictation-partial` and `dictation-final` events from Rust/Swift into the
  webview.
- Keep the same store actions: `receiveVoicePartial` and `receiveVoiceFinal`.

Future offline provider:

- Add `whisper.cpp` or `faster-whisper` as a local sidecar.
- Stream short audio chunks into the sidecar and reuse the same store actions.
- Keep keyword intent classification in front of any model call so the surface
  skeleton still appears under the 600-800ms target.

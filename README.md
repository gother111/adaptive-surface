# Adaptive Surface

Modern macOS-first desktop app scaffold built with Tauri 2, React 19, TypeScript,
Vite, Tailwind CSS v4, shadcn-style UI primitives, Zustand, cmdk, Sonner, and
tldraw.

## What is included

- Tauri 2 app shell with a macOS overlay titlebar, native traffic lights, window
  state persistence, and full-screen capable main window.
- Global shortcut support for `Cmd + Shift + Space`.
- Dynamic `SurfaceRenderer` that renders JSON-backed surface configs.
- Surface types: Brief, Canvas, Decision View, Approval Card, and Settings.
- tldraw-powered editable canvas.
- Floating microphone button using the Web Speech API with a runtime fallback
  message.
- Zustand store wired to live runtime-event projection and catch-up.
- Rust control-plane service for finalized objective increments, durable
  accepted-run responses, dependency-aware task scheduling, runtime events,
  SQLite-backed request/session recovery, and the migrated read-only
  inbox-triage slice.
- Rust `run_applescript` command placeholder for future approval-gated macOS
  automation.
- Dark-first Tailwind v4 token system compatible with shadcn/ui conventions.

## Create the project from scratch

If you are recreating this scaffold manually, use this flow:

```bash
npm create tauri-app@latest adaptive-surface -- --template react-ts --manager npm
cd adaptive-surface

npm install react@latest react-dom@latest @tauri-apps/api@latest
npm install zustand tldraw lucide-react sonner cmdk clsx tailwind-merge class-variance-authority tw-animate-css
npm install @radix-ui/react-dialog @radix-ui/react-dropdown-menu @radix-ui/react-label @radix-ui/react-scroll-area @radix-ui/react-select @radix-ui/react-separator @radix-ui/react-slot @radix-ui/react-switch @radix-ui/react-tabs @radix-ui/react-tooltip
npm install -D typescript vite @vitejs/plugin-react tailwindcss @tailwindcss/vite @types/node @types/react @types/react-dom @tauri-apps/cli

cd src-tauri
cargo add tauri@2 serde serde_json tauri-plugin-window-state tauri-plugin-global-shortcut tauri-plugin-shell tauri-plugin-fs tauri-plugin-dialog
cd ..
```

This repository already contains the resulting code and configuration, so for
this local copy you can start at installation.

## Install

```bash
git clone https://github.com/gother111/adaptive-surface.git
cd adaptive-surface
npm install
```

## Run in development

```bash
npm run tauri:dev
```

The app opens as a native macOS desktop window. Use `Cmd + Shift + Space` to
toggle live dictation.

If you only want the web frontend during UI work:

```bash
npm run dev
```

Then open `http://localhost:1420`.

## Test the real-time voice flow

No new npm dependencies are required for the current implementation.

1. Start the native app:

```bash
source "$HOME/.cargo/env"
npm run tauri:dev
```

2. Click the large floating `Speak surface` microphone button, or press
   `Cmd + Shift + Space`.

3. Try short phrases first:

```text
Prepare a brief about the product launch
Compare Notion and Linear in a table
Help me decide between hiring now or waiting
Catch me up on what changed since yesterday
No, change it to a comparison table
```

4. Watch for three things:

- live transcript text appears while you are still speaking
- the center surface morphs before the final transcript arrives
- the mic panel shows the detected intent and first-partial latency

The current provider uses Web Speech interim results when available. The intent
classifier is synchronous and local, so the app can show the first useful
surface skeleton immediately after the first partial transcript arrives.

Native macOS dictation is the next provider: add a Tauri plugin around
`SFSpeechRecognizer` and `AVAudioEngine`, then emit partial/final dictation
events into the same Zustand actions. See `src/voice/README.md`.

## Build a macOS app and DMG

```bash
npm run tauri:build
```

This runs `tauri build --bundles app` and then creates the DMG with
`scripts/create-dmg.sh`.

The generated macOS artifacts will appear under:

```text
src-tauri/target/release/bundle/
```

The DMG is typically in:

```text
src-tauri/target/release/bundle/dmg/
```

## Contributing

Contributions are welcome. Good first areas are documentation, deterministic
tests, frontend-only UI refinements, and small improvements that preserve the
native permission and approval boundaries.

Before opening a pull request, please run the relevant checks:

```bash
npm run typecheck
npm test
```

For Rust or Tauri bridge changes, also run the smallest relevant Rust check:

```bash
cargo check --manifest-path src-tauri/Cargo.toml
```

Avoid broadening macOS permissions, local file access, Apple Events, microphone
access, or external app automation without documenting the privacy impact and
the approval flow.

## Next engineering steps

- Migrate one additional read-only workflow through the generic Rust scheduler
  while keeping each new capability typed and approval-gated.
- Move non-migrated finalized routes out of TypeScript compatibility fallback.
- Add planner shadow mode and richer executor receipts before enabling new
  external mutations.
- Add permission checks for Accessibility, Apple Events, microphone, and file
  access before enabling integrations.
- Add browser or WebDriver smoke tests for the web shell and Tauri command tests
  for the Rust bridge.

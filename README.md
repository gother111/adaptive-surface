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
- Zustand store prepared for incremental agent streaming updates.
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
cd "/Users/pavlosamoshko/Documents/New project"
npm install
```

## Run in development

```bash
npm run tauri:dev
```

The app opens as a native macOS desktop window. Use `Cmd + Shift + Space` to
focus the app and open the command palette.

If you only want the web frontend during UI work:

```bash
npm run dev
```

Then open `http://localhost:1420`.

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

## Next engineering steps

- Connect `useSurfaceStore` to a local LangGraph or FastAPI streaming backend.
- Add typed model routing for surface selection, state patches, and approval
  cards.
- Replace the AppleScript placeholder with a small allowlisted action registry.
- Add permission checks for Accessibility, Apple Events, microphone, and file
  access before enabling integrations.
- Add Playwright or WebDriver smoke tests for the web shell and Tauri command
  tests for the Rust bridge.

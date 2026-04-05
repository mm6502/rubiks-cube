# Quickstart for Contributors

## Prerequisities

- **Node.js**: Version 16 or higher
- **npm**: Comes with Node.js installation
- **Modern Code Editor**: e.g., Visual Studio Code
- **Web Browser**: Microsoft Edge, Google Chrome, or Firefox for testing

## Project Structure

```plaintext
.
├── src/
│   ├── cube/              # Cube model and utilities
│   │   ├── core/          # Core cube logic
│   │   ├── types/         # Cube-specific types
│   │   └── utils/         # Cube utility functions
│   ├── diagnostics/       # Logging and diagnostics
│   ├── docs/              # Documentation files
│   ├── events/            # Event system
│   ├── icons/             # Icon assets
│   ├── styles/            # CSS styles and modules
│   ├── types/             # TypeScript type definitions
│   ├── view-manager/      # View orchestration and management
│   ├── views/             # View implementations
│   │   ├── basic/         # Basic view implementation
│   │   ├── flat/          # Flat 2D view implementation
│   │   ├── circular/      # Circular view implementation
│   │   └── moves/         # Moves view implementation
│   ├── application.ts     # Main application logic
│   ├── cube-controller.ts # Cube interaction controller
│   ├── global.ts          # Global utilities
│   ├── main.ts            # Application entry point
│   └── main.css           # Main stylesheet
├── coverage/              # Test coverage reports
├── dist/                  # Build output (single HTML file)
├── index.html             # Main HTML file
├── package.json           # Dependencies and scripts
├── tsconfig.json          # TypeScript configuration
├── tsconfig.test.json     # Test TypeScript configuration
├── vite.config.ts         # Vite build configuration
├── vitest.config.ts       # Vitest configuration
├── vitest.setup.ts        # Test setup
├── eslint.config.cjs      # ESLint configuration
├── AGENTS.md              # Agent documentation
├── code-quality-evaluation.md  # Code quality evaluation
└── README.md              # This file
```

## Development Setup

0. **Clone Repository**

   ```bash
   git clone https://github.com/mm6502/rubiks-cube.git
   cd rubiks-cube
   ```

1. **Install Dependencies**

   ```bash
   npm install
   ```

2. **Start Development Server**

   ```bash
   npm run dev
   ```

   This starts Vite's development server with hot module replacement.

3. **Type Checking**

   ```bash
   npm run type-check
   ```

   Runs TypeScript compiler to check for type errors without emitting files.

4. **Run Tests**

   ```bash
   npm test
   ```

   Executes the test suite using Vitest.

## Building for Production

1. **Build Single File**

   ```bash
   npm run build
   ```

   Creates a single HTML file in the `dist/` directory with all CSS and JavaScript inlined.

2. **Preview Build**

   ```bash
   npm run preview
   ```

   Serves the built files locally for testing.

## Build System

This project uses **Vite** with the `vite-plugin-singlefile` plugin to create a single, self-contained HTML file that includes:

- All TypeScript code compiled and bundled into JavaScript
- All CSS styles inlined
- All assets (if any) inlined as data URLs

### Key Configuration Features

- **Modern TypeScript**: ES2020 target with strict type checking
- **Path Aliases**: `@/` maps to `src/` for cleaner imports
- **Single File Output**: Everything bundled into one HTML file
- **Asset Inlining**: All resources embedded for offline use
- **Tree Shaking**: Unused code automatically removed

## Deployment

The built HTML file in `dist/` is completely self-contained and can be:

- Opened directly in any modern web browser
- Served from any static file server
- Deployed to GitHub Pages, Netlify, Vercel, etc.
- Shared as a single file without any server requirements

## Architecture

The application follows a clean MVC-like architecture:

- **Model**: `src/cube/` — Core cube state, move engine, and utilities
- **View**: Multiple view implementations in `src/views/` directory
- **Controller**: `src/cube-controller.ts` — User interaction handling
- **View Manager**: `src/view-manager/` — Orchestrates multiple views and their lifecycle

## Browser Compatibility

- Modern browsers with ES2020 support
- Local storage for state persistence

## Debugging in VS Code

1. Start the Vite dev server and debug from VS Code:
   - Open the Run view and choose "Launch Edge (Vite)". This runs `npm run dev` and opens Edge at `http://localhost:5173`.

2. Attach to an existing Edge instance:
   - Start Edge with remote debugging: `"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe" --remote-debugging-port=9222`.
   - In VS Code choose "Attach to Edge (remote)".

3. Manual dev server:

```powershell
npm run dev
```

Then start the debugger without the preLaunchTask.

Note: Vite will try the default port (`5173`) but will automatically pick the next available port if it's in use. When that happens the server prints the actual URL (e.g. `Local: http://localhost:5173/`). Use that URL in your browser or update `/.vscode/launch.json` accordingly.

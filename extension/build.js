const esbuild = require("esbuild");
const fs = require("fs");
const path = require("path");

const isWatch = process.argv.includes("--watch");

function copyFileSync(src, dest) {
  const destDir = path.dirname(dest);
  if (!fs.existsSync(destDir)) {
    fs.mkdirSync(destDir, { recursive: true });
  }
  fs.copyFileSync(src, dest);
}

function syncToLegacyPaths() {
  const mappings = [
    ["dist/popup.js", "dist/extension/src/popup/popup.js"],
    ["dist/background.js", "dist/extension/src/background/index.js"],
    ["dist/dom-extractor.js", "dist/extension/src/contents/dom-extractor.js"],
    ["dist/offscreen.js", "dist/extension/src/offscreen/offscreen.js"],
  ];

  for (const [src, dest] of mappings) {
    const srcPath = path.resolve(__dirname, src);
    const destPath = path.resolve(__dirname, dest);
    if (fs.existsSync(srcPath)) {
      copyFileSync(srcPath, destPath);
    }
  }
}

async function run() {
  const targets = [
    {
      entryPoints: [path.resolve(__dirname, "src/popup/popup.tsx")],
      bundle: true,
      outfile: path.resolve(__dirname, "dist/popup.js"),
      format: "iife",
      platform: "browser",
      target: "es2020",
      minify: true,
      define: { "process.env.NODE_ENV": '"production"' },
    },
    {
      entryPoints: [path.resolve(__dirname, "src/background/index.ts")],
      bundle: true,
      outfile: path.resolve(__dirname, "dist/background.js"),
      format: "esm",
      platform: "browser",
      target: "es2020",
    },
    {
      entryPoints: [path.resolve(__dirname, "src/contents/dom-extractor.ts")],
      bundle: true,
      outfile: path.resolve(__dirname, "dist/dom-extractor.js"),
      format: "iife",
      platform: "browser",
      target: "es2020",
    },
    {
      entryPoints: [path.resolve(__dirname, "src/offscreen/offscreen.ts")],
      bundle: true,
      outfile: path.resolve(__dirname, "dist/offscreen.js"),
      format: "iife",
      platform: "browser",
      target: "es2020",
    },
  ];

  if (isWatch) {
    console.log("[Build] Starting esbuild watch mode...");
    for (const target of targets) {
      const ctx = await esbuild.context({
        ...target,
        plugins: [
          {
            name: "post-build-sync",
            setup(build) {
              build.onEnd(() => {
                syncToLegacyPaths();
              });
            },
          },
        ],
      });
      await ctx.watch();
    }
    console.log("[Build] Watching for extension source changes...");
  } else {
    console.log("[Build] Bundling extension assets with esbuild...");
    for (const target of targets) {
      await esbuild.build(target);
    }
    syncToLegacyPaths();
    console.log("[Build] Extension bundled successfully into dist/ and synced to legacy paths.");
  }
}

run().catch((err) => {
  console.error("[Build Error]:", err);
  process.exit(1);
});

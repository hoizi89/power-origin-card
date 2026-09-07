import { defineConfig } from "vitest/config";

export default defineConfig({
  publicDir: false,
  build: {
    lib: {
      entry: "src/power-origin-card.ts",
      name: "PowerOriginCard",
      formats: ["es"],
      fileName: () => "power-origin-card.js"
    },
    outDir: "dist",
    emptyOutDir: true,
    sourcemap: true,
    minify: "esbuild",
    rollupOptions: {
      output: {
        inlineDynamicImports: true
      }
    }
  },
  test: {
    include: ["tests/**/*.test.ts"]
  }
});

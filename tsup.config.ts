import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/extension.ts"],
  format: ["cjs"],
  external: ["vscode"],
  target: "node18",
  outDir: "dist",
  clean: true,
  sourcemap: false,
  minify: false,
});

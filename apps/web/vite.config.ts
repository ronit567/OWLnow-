import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// base "./" lets the same build run from any path, such as a GitHub Pages project site.
export default defineConfig({
  base: "./",
  plugins: [react()],
  build: { target: "es2022" },
  server: { port: 5173 },
});

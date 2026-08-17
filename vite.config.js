import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Local development stays at root. Release builds pass an explicit Pages base:
// /Roll30-Nightforge/ for preview and /Roll30/ for production.
export default defineConfig({
  plugins: [react()],
});

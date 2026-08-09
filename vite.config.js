import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Standalone UI-redesign sandbox — served from root (unlike the real project's
// /Roll30/ base) so it runs cleanly on its own.
export default defineConfig({
  plugins: [react()],
});

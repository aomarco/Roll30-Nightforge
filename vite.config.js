import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const frozenRemoteFontImport = /^@import[^\r\n]*fonts\.googleapis\.com[^\r\n]*(?:\r?\n)?/m;

const localNightforgeFonts = {
  name: "nightforge-local-fonts",
  enforce: "pre",
  transform(code, id) {
    if (!/[\\/]src[\\/]styles[\\/]core\.css(?:\?|$)/.test(id)) return null;
    return { code: code.replace(frozenRemoteFontImport, ""), map: null };
  },
};

// Local development stays at root. Release builds pass an explicit Pages base:
// /Roll30-Nightforge/ for preview and /Roll30/ for production.
export default defineConfig({
  plugins: [localNightforgeFonts, react()],
  build: {
    rolldownOptions: {
      output: {
        codeSplitting: {
          groups: [{ name: "vendor", test: /node_modules[\\/]/ }],
        },
      },
    },
  },
});

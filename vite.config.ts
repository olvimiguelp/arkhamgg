import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { readFileSync } from "fs";
import { componentTagger } from "lovable-tagger";

const pkg = JSON.parse(readFileSync(path.resolve(__dirname, "package.json"), "utf-8")) as {
  version?: string
};

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  base: "./", // <--- IMPORTANTE: Esto arregla la pantalla en blanco en el .exe
  server: {
    host: "0.0.0.0",
    port: 3000,
  },
  plugins: [react(), mode === "development" && componentTagger()].filter(Boolean),
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
      "@super_admin": path.resolve(__dirname, "./super_admin"),
    },
  },
  build: {
    outDir: "dist",
    emptyOutDir: true,
    chunkSizeWarningLimit: 1000,
  },
  define: {
    "import.meta.env.VITE_APP_VERSION": JSON.stringify(pkg.version ?? "0.0.0"),
  },
}));

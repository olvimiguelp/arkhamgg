import { defineConfig } from "vite"
import react from "@vitejs/plugin-react-swc"
import path from "node:path"
export default defineConfig({
  root: __dirname,
  base: "/catalogo-publico/",
  plugins: [react()],
  resolve: { alias: { "@": path.resolve(__dirname, "../src") } },
  build: {
    // El catálogo se publica como una subruta de la aplicación principal.
    outDir: "../dist/catalogo-publico",
    emptyOutDir: true,
  },
})

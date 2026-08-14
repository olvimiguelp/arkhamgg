import { defineConfig } from "vite"
import react from "@vitejs/plugin-react-swc"

export default defineConfig({
  // Configuración estándar de Vite: al ejecutar Vite dentro de esta carpeta,
  // el resultado queda en catalogo-publico/dist.
  root: __dirname,
  base: process.env.VITE_BASE_PATH || "/",
  plugins: [react()],
  build: { outDir: "dist", emptyOutDir: true },
})

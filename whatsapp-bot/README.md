# WhatsApp Reminder Bot (whatsapp-web.js)

Este bot usa `whatsapp-web.js` para enviar recordatorios desde WhatsApp Web.
Debe ejecutarse en una maquina siempre encendida (PC/VPS) porque mantiene una sesion activa.

## Quick start
1. `cd whatsapp-bot`
2. `npm install`
3. Copia `.env.example` a `.env` y completa las variables.
4. `npm run start` y escanea el QR.

## Modo una sola vez
- `npm run once`

## Notas
- La sesion se guarda en `.wwebjs_auth` para evitar escanear QR cada vez.
- Este bot consulta Supabase y envia recordatorios segun `reminder_enabled` y el intervalo.

## Nota de Chromium
Si la instalacion de puppeteer falla, puedes usar tu Chrome local:
- En .env agrega CHROME_EXECUTABLE_PATH con la ruta a chrome.exe
- Instala con: PUPPETEER_SKIP_DOWNLOAD=1 npm install --ignore-scripts

Ejemplo ruta:
C:\Program Files\Google\Chrome\Application\chrome.exe

// ============================================================
//  RELEVA · Bot de WhatsApp  (Twilio Sandbox + Claude)
// ============================================================
// No necesitás tocar este archivo. Para cambiar el negocio,
// editá config.js. Para correrlo: ver README.md.

import express from "express";
import fs from "node:fs";
import { SYSTEM_PROMPT } from "./config.js";

// --- carga simple del archivo .env (sin dependencias) ---
try {
  const env = fs.readFileSync(new URL("./.env", import.meta.url), "utf8");
  for (const line of env.split("\n")) {
    const m = line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*)\s*$/i);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
} catch (_) { /* si no hay .env, se usan las variables del sistema (ej. en Render) */ }

const app = express();
app.use(express.urlencoded({ extended: false })); // Twilio manda form-urlencoded

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const MODEL = process.env.CLAUDE_MODEL || "claude-haiku-4-5-20251001";

if (!ANTHROPIC_API_KEY) {
  console.warn("⚠️  Falta ANTHROPIC_API_KEY. Ponela en el archivo .env (ver README).");
}

// memoria simple de conversación por número (en memoria, se borra al reiniciar)
const sessions = new Map();

function escapeXml(s) {
  return String(s).replace(/[<>&'"]/g, c => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", "'": "&apos;", '"': "&quot;" }[c]));
}

async function askClaude(history) {
  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01"
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 400,
        system: SYSTEM_PROMPT,
        messages: history
      })
    });
    const data = await res.json();
    if (!res.ok) {
      console.error("Error de Claude:", JSON.stringify(data));
      return "Perdoná, estoy con un problema técnico en este momento. Te paso con alguien del local en un ratito 🙏";
    }
    return (data.content && data.content[0] && data.content[0].text) || "...";
  } catch (e) {
    console.error("Error de red con Claude:", e.message);
    return "Uy, se me cortó la conexión. Probá de nuevo en un minutito 🙏";
  }
}

// Webhook que llama Twilio cada vez que llega un WhatsApp
app.post("/webhook", async (req, res) => {
  const from = req.body.From || "anon";
  const body = (req.body.Body || "").trim();
  console.log(`📩 ${from}: ${body}`);

  let hist = sessions.get(from) || [];
  hist.push({ role: "user", content: body });
  if (hist.length > 20) hist = hist.slice(-20); // últimas 20 para no crecer infinito

  const reply = await askClaude(hist);
  hist.push({ role: "assistant", content: reply });
  sessions.set(from, hist);

  console.log(`🤖 ${reply}`);
  res.set("Content-Type", "text/xml");
  res.send(`<?xml version="1.0" encoding="UTF-8"?><Response><Message>${escapeXml(reply)}</Message></Response>`);
});

// para chequear que el server está vivo desde el navegador
app.get("/", (_req, res) => res.send("✅ Releva bot funcionando. El webhook es /webhook"));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`✅ Releva bot escuchando en el puerto ${PORT}`));

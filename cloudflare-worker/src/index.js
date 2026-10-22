const API = "https://api.telegram.org";

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}

async function telegram(env, method, payload) {
  const response = await fetch(`${API}/bot${env.TELEGRAM_BOT_TOKEN}/${method}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!response.ok) {
    console.error("Telegram API request failed", method, response.status);
    throw new Error("Telegram API request failed");
  }
  return response.json();
}

async function send(env, chatId, text, reply_markup) {
  return telegram(env, "sendMessage", {
    chat_id: chatId,
    text,
    ...(reply_markup ? { reply_markup } : {}),
  });
}

function menu() {
  return { inline_keyboard: [
    [{ text: "🎴 Créer ma carte", callback_data: "create" }],
    [{ text: "🎨 Modèles actifs", callback_data: "templates" }],
    [{ text: "🌐 Ouvrir le site", url: "https://ryah001.github.io/otaku-card-maker/" }],
  ] };
}

function homeKeyboard() {
  return { inline_keyboard: [[{ text: "↩️ Menu", callback_data: "home" }]] };
}

function colorKeyboard() {
  return { inline_keyboard: ["Bleu", "Vert", "Orange", "Violet", "Jaune", "Rouge"]
    .map((color) => [{ text: color, callback_data: `color:${color}` }])
    .concat([[{ text: "↩️ Annuler", callback_data: "home" }]]) };
}

async function getState(env, chatId) {
  if (!env.SESSIONS) throw new Error("SESSIONS KV binding is missing");
  return (await env.SESSIONS.get(`chat:${chatId}`, "json")) || {};
}
async function putState(env, chatId, state) {
  await env.SESSIONS.put(`chat:${chatId}`, JSON.stringify(state), { expirationTtl: 86400 });
}
async function clearState(env, chatId) {
  if (env.SESSIONS) await env.SESSIONS.delete(`chat:${chatId}`);
}

async function templates(env, chatId) {
  const url = (env.SUPABASE_URL || "").replace(/\/$/, "");
  const key = env.SUPABASE_ANON_KEY || "";
  if (!url.startsWith("https://") || !key) {
    await send(env, chatId, "Le catalogue n’est pas encore configuré. Réessaie plus tard.", homeKeyboard());
    return;
  }
  const query = new URLSearchParams({
    select: "id,template_key,label,asset_path",
    is_active: "eq.true",
    order: "label.asc",
    limit: "40",
  });
  const response = await fetch(`${url}/rest/v1/card_templates?${query}`, {
    headers: { apikey: key, Authorization: `Bearer ${key}` },
  });
  if (!response.ok) {
    console.error("Supabase catalog request failed", response.status);
    await send(env, chatId, "Le catalogue est temporairement indisponible.", homeKeyboard());
    return;
  }
  const rows = await response.json();
  const labels = Array.isArray(rows) ? rows.map((row) => String(row.label || row.template_key || "").trim()).filter(Boolean) : [];
  await send(env, chatId, labels.length
    ? "🎨 Modèles actifs sur le site :\n\n" + labels.map((label) => "• " + label).join("\n")
    : "Aucun modèle actif n’est disponible.", homeKeyboard());
}

async function handleMessage(env, message) {
  const chatId = message.chat?.id;
  if (!chatId) return;
  const text = (message.text || "").trim();
  if (!text) return;
  if (text === "/start" || text === "/help") {
    await clearState(env, chatId);
    await send(env, chatId,
      "👋 Bienvenue dans Otaku Card Maker !\n\nTu peux préparer les informations de ton profil. La génération PNG n’est pas encore activée dans cette version Cloudflare.",
      menu());
    return;
  }
  if (text === "/cancel") {
    await clearState(env, chatId);
    await send(env, chatId, "Création annulée.", menu());
    return;
  }
  const state = await getState(env, chatId);
  const p = state.profile || {};
  const value = text.slice(0, 180);
  switch (state.step) {
    case "name":
      if (value.length < 2 || value.length > 50) {
        await send(env, chatId, "Le nom doit contenir entre 2 et 50 caractères.");
        return;
      }
      p.name = value; state.step = "username";
      await send(env, chatId, "Étape 2/5 — Ton pseudo, ou — pour ignorer.");
      break;
    case "username":
      p.username = value === "—" ? "" : value.slice(0, 40); state.step = "role";
      await send(env, chatId, "Étape 3/5 — Ton rôle/titre, ou — pour ignorer.");
      break;
    case "role":
      p.role = value === "—" ? "" : value.slice(0, 60); state.step = "bio";
      await send(env, chatId, "Étape 4/5 — Courte description, ou — pour ignorer.");
      break;
    case "bio":
      p.bio = value === "—" ? "" : value.slice(0, 180); state.step = "whatsapp";
      await send(env, chatId, "Étape 5/5 — Numéro WhatsApp international, ou — pour ignorer.");
      break;
    case "whatsapp": {
      if (value === "—") p.whatsapp = "";
      else {
        const digits = value.replace(/\D/g, "");
        if (digits.length < 8 || digits.length > 15) {
          await send(env, chatId, "Numéro invalide. Envoie l’indicatif international ou —.");
          return;
        }
        p.whatsapp = digits;
      }
      state.profile = p; state.step = "color";
      await putState(env, chatId, state);
      await send(env, chatId, "Choisis une couleur :", colorKeyboard());
      return;
    }
    default:
      await send(env, chatId, "Utilise /start pour ouvrir le menu.", menu());
      return;
  }
  state.profile = p;
  await putState(env, chatId, state);
}

async function handleCallback(env, callback) {
  const chatId = callback.message?.chat?.id;
  const messageId = callback.message?.message_id;
  const data = callback.data || "";
  await telegram(env, "answerCallbackQuery", { callback_query_id: callback.id });
  if (!chatId) return;
  if (data === "home") {
    await clearState(env, chatId);
    await telegram(env, "editMessageText", { chat_id: chatId, message_id: messageId, text: "Menu principal :", reply_markup: menu() });
  } else if (data === "templates") {
    await templates(env, chatId);
  } else if (data === "create") {
    await putState(env, chatId, { step: "name", profile: {} });
    await telegram(env, "editMessageText", { chat_id: chatId, message_id: messageId, text: "🎴 Étape 1/5 — Quel nom veux-tu afficher ? Envoie-le ici. (/cancel pour arrêter)" });
  } else if (data.startsWith("color:")) {
    const state = await getState(env, chatId);
    if (state.step !== "color" || !state.profile) {
      await send(env, chatId, "Session expirée. Relance /start.", menu());
      return;
    }
    const color = data.slice(6);
    if (!["Bleu", "Vert", "Orange", "Violet", "Jaune", "Rouge"].includes(color)) return;
    state.profile.color = color;
    state.step = "review";
    await putState(env, chatId, state);
    const p = state.profile;
    await telegram(env, "editMessageText", {
      chat_id: chatId, message_id: messageId,
      text: `🔎 Récapitulatif du profil\n\nNom : ${p.name}\nPseudo : ${p.username || "Non renseigné"}\nRôle : ${p.role || "Non renseigné"}\nDescription : ${p.bio || "Non renseignée"}\nWhatsApp : ${p.whatsapp || "Non renseigné"}\nCouleur : ${p.color}\n\nAucune image n’a été générée et rien n’a été enregistré sur le site.`,
      reply_markup: { inline_keyboard: [
        [{ text: "✅ Confirmer le profil", callback_data: "confirm" }],
        [{ text: "🔄 Recommencer", callback_data: "create" }],
        [{ text: "↩️ Menu", callback_data: "home" }],
      ] },
    });
  } else if (data === "confirm") {
    await telegram(env, "editMessageText", {
      chat_id: chatId, message_id: messageId,
      text: "✅ Profil préparé. La génération PNG, la liaison sécurisée du compte et l’historique ne sont pas encore activés. Rien n’a été enregistré dans l’historique.",
      reply_markup: { inline_keyboard: [
        [{ text: "🌐 Ouvrir le site", url: "https://ryah001.github.io/otaku-card-maker/" }],
        [{ text: "🎴 Nouveau profil", callback_data: "create" }],
        [{ text: "↩️ Menu", callback_data: "home" }],
      ] },
    });
  }
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (request.method === "GET" && url.pathname === "/health") return json({ ok: true, service: "otaku-card-telegram-bot" });
    if (request.method === "POST" && url.pathname === "/setup/webhook") {
      if (!env.SETUP_SECRET || request.headers.get("x-setup-secret") !== env.SETUP_SECRET) return json({ error: "Unauthorized" }, 401);
      if (!env.TELEGRAM_BOT_TOKEN || !env.TELEGRAM_WEBHOOK_SECRET) return json({ error: "Missing Telegram secrets" }, 500);
      const result = await telegram(env, "setWebhook", {
        url: `${url.origin}/telegram/webhook`,
        secret_token: env.TELEGRAM_WEBHOOK_SECRET,
        allowed_updates: ["message", "callback_query"],
        drop_pending_updates: false,
      });
      return json({ ok: Boolean(result.ok), webhook_url: `${url.origin}/telegram/webhook` });
    }
    if (request.method !== "POST" || url.pathname !== "/telegram/webhook") return json({ error: "Not found" }, 404);
    if (!env.TELEGRAM_BOT_TOKEN || !env.TELEGRAM_WEBHOOK_SECRET) return json({ error: "Missing configuration" }, 500);
    if (request.headers.get("x-telegram-bot-api-secret-token") !== env.TELEGRAM_WEBHOOK_SECRET) return json({ error: "Unauthorized" }, 401);
    let update;
    try { update = await request.json(); } catch { return json({ error: "Invalid JSON" }, 400); }
    try {
      if (update.message) await handleMessage(env, update.message);
      else if (update.callback_query) await handleCallback(env, update.callback_query);
      return json({ ok: true });
    } catch (error) {
      console.error("Update processing failed", error instanceof Error ? error.message : "unknown error");
      return json({ ok: true });
    }
  },
};

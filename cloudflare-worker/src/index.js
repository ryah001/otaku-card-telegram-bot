import { renderCard } from "./card-renderer.js";

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

async function sendPhoto(env, chatId, png, caption) {
  const form = new FormData();
  form.set("chat_id", String(chatId));
  form.set("caption", String(caption || "").slice(0, 1024));
  form.set("photo", new Blob([png], { type: "image/png" }), "carte-otaku.png");
  const response = await fetch(`${API}/bot${env.TELEGRAM_BOT_TOKEN}/sendPhoto`, { method: "POST", body: form });
  const result = await response.json();
  if (!response.ok || !result.ok) {
    console.error("Telegram sendPhoto failed", response.status);
    throw new Error("Telegram photo delivery failed");
  }
  return result;
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
  const labels = ["Bleu", "Vert", "Orange", "Violet", "Jaune", "Rouge"];
  await send(env, chatId, "🎨 Couleurs disponibles :\\n\\n" + labels.map((label) => "• " + label).join("\\n"), homeKeyboard());
}

async function handleMessage(env, message) {
  const chatId = message.chat?.id;
  if (!chatId) return;
  const text = (message.text || "").trim();
  const photo = Array.isArray(message.photo) && message.photo.length ? message.photo[message.photo.length - 1] : null;
  if (!text && !photo) return;
  if (text === "/start" || text === "/help") {
    await clearState(env, chatId);
    await send(env, chatId,
      "👋 Bienvenue dans Otaku Card Maker !\n\nTu peux créer une carte Otaku en remplissant ton profil étape par étape, puis confirmer pour recevoir ta carte PNG ici dans Telegram. Choisis « Créer ma carte » pour commencer.",
      menu());
    return;
  }
  if (text === "/cancel") {
    await clearState(env, chatId);
    await send(env, chatId, "Opération annulée.", menu());
    return;
  }
  const state = await getState(env, chatId);
  const p = state.profile || {};
  const value = text.slice(0, 180);
  if (state.step === "photo") {
    if (photo) {
      p.photo_file_id = photo.file_id;
      const fileInfo = await telegram(env, "getFile", { file_id: photo.file_id });
      const filePath = fileInfo.result?.file_path;
      if (filePath) p.photo_url = `${API}/file/bot${env.TELEGRAM_BOT_TOKEN}/${filePath}`;
    } else if (text !== "—") {
      await send(env, chatId, "Envoie une photo de profil ou réponds — pour continuer sans photo.");
      return;
    }
    state.profile = p; state.step = "color";
    await putState(env, chatId, state);
    await send(env, chatId, "Choisis la couleur de ta carte :", colorKeyboard());
    return;
  }
  if (photo) {
    await send(env, chatId, "Pour ajouter une photo, suis d’abord les étapes du formulaire. Utilise /start pour recommencer.");
    return;
  }
  switch (state.step) {
    case "name":
      if (value.length < 2 || value.length > 50) {
        await send(env, chatId, "Le nom réel doit contenir entre 2 et 50 caractères.");
        return;
      }
      p.name = value; state.step = "username";
      await send(env, chatId, "Étape 2/6 — Ton pseudo Otaku (40 caractères max), ou — pour ignorer.");
      break;
    case "username":
      p.username = value === "—" ? "" : value.slice(0, 40); state.step = "nationality";
      await send(env, chatId, "Étape 3/6 — Ta nationalité (ex. Congolaise), ou — pour ignorer.");
      break;
    case "nationality":
      p.nationality = value === "—" ? "" : value.slice(0, 50); state.step = "status";
      await send(env, chatId, "Étape 4/6 — Ton statut/titre sur la carte, ou — pour ignorer.");
      break;
    case "status":
      p.status = value === "—" ? "" : value.slice(0, 60); state.step = "genre";
      await send(env, chatId, "Étape 5/6 — Ton genre/profil Otaku, ou — pour ignorer.");
      break;
    case "genre":
      p.genre = value === "—" ? "" : value.slice(0, 60); state.step = "quote";
      await send(env, chatId, "Étape 6/6 — Ta citation (jusqu’à 2 lignes), ou — pour ignorer.");
      break;
    case "quote":
      p.quote = value === "—" ? "" : value.slice(0, 100); state.step = "photo";
      await send(env, chatId, "Envoie maintenant ta photo de profil comme image, ou réponds — pour continuer sans photo.");
      break;
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
    await telegram(env, "editMessageText", { chat_id: chatId, message_id: messageId, text: "🎴 Étape 1/6 — Quel est ton nom réel ? Envoie-le ici. (/cancel pour arrêter)" });
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
      text: `🔎 Récapitulatif de ta carte\n\nPseudo : ${p.username || "Non renseigné"}\nNom réel : ${p.name}\nNationalité : ${p.nationality || "Non renseignée"}\nStatut : ${p.status || "Non renseigné"}\nGenre : ${p.genre || "Non renseigné"}\nCitation : ${p.quote || "Non renseignée"}\nPhoto : ${p.photo_file_id ? "Ajoutée" : "Aucune"}\nCouleur : ${p.color}\n\nLa carte sera générée et envoyée ici après confirmation. Elle ne sera pas ajoutée à l’historique du site.`,
      reply_markup: { inline_keyboard: [
        [{ text: "✅ Confirmer le profil", callback_data: "confirm" }],
        [{ text: "🔄 Recommencer", callback_data: "create" }],
        [{ text: "↩️ Menu", callback_data: "home" }],
      ] },
    });
  } else if (data === "confirm") {
    const state = await getState(env, chatId);
    if (state.step !== "review" || !state.profile) {
      await send(env, chatId, "Cette session a expiré. Relance /start pour créer une nouvelle carte.", menu());
      return;
    }
    try {
      await telegram(env, "editMessageText", {
        chat_id: chatId, message_id: messageId,
        text: "⏳ Génération de ta carte Otaku en cours…",
      });
      const png = await renderCard(state.profile);
      const caption = "🎴 Ta Carte Otaku est prête !\n\nCréée avec HUNTERS ANIMES • La chasse est ouverte.\nCette carte est envoyée dans Telegram et n’est pas enregistrée dans l’historique du site.";
      await sendPhoto(env, chatId, png, caption);
      await clearState(env, chatId);
      await send(env, chatId, "✅ Carte générée et envoyée !", {
        inline_keyboard: [
          [{ text: "🎴 Créer une autre carte", callback_data: "create" }],
          [{ text: "↩️ Menu", callback_data: "home" }],
        ],
      });
    } catch (error) {
      console.error("Card generation failed", error instanceof Error ? error.message : "unknown error");
      await send(env, chatId, "❌ Je n’ai pas pu générer ou envoyer la carte cette fois. Ton profil est conservé pendant 24 h : appuie à nouveau sur « Confirmer le profil » pour réessayer.", {
        inline_keyboard: [
          [{ text: "✅ Réessayer", callback_data: "confirm" }],
          [{ text: "↩️ Menu", callback_data: "home" }],
        ],
      });
    }
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

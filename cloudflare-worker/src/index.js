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
    [{ text: "🔐 Lier mon compte du site", callback_data: "connect" }],
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

async function startConnect(env, chatId) {
  const linked = await env.SESSIONS.get(`telegram-link:${chatId}`, "json");
  if (linked?.user_id) {
    await send(env, chatId, "🔐 Ce compte Telegram est déjà lié à un compte Carte Otaku. Pour éviter une association accidentelle, la liaison existante n’est pas remplacée automatiquement.", menu());
    return;
  }
  await putState(env, chatId, { step: "connect_email", connect: { started_at: Date.now(), attempts: 0 } });
  await send(env, chatId, "🔐 Liaison sécurisée du compte\n\nEnvoie l’adresse e-mail déjà utilisée pour te connecter au site Carte Otaku. Je t’enverrai un code de vérification par e-mail.\n\nN’envoie jamais ton mot de passe. Utilise /cancel pour arrêter.");
}

async function requestEmailOtp(env, chatId, email) {
  const state = await getState(env, chatId);
  const now = Date.now();
  const previous = await env.SESSIONS.get(`otp-rate:${chatId}`, "json");
  if (previous?.sent_at && now - previous.sent_at < 60000) {
    await send(env, chatId, "Attends une minute avant de demander un nouveau code.");
    return;
  }
  const url = (env.SUPABASE_URL || "").replace(/\/$/, "");
  const key = env.SUPABASE_ANON_KEY || "";
  if (!url.startsWith("https://") || !key) {
    await send(env, chatId, "La liaison de compte n’est pas configurée correctement. Réessaie plus tard.", menu());
    return;
  }
  const response = await fetch(`${url}/auth/v1/otp`, {
    method: "POST",
    headers: { "content-type": "application/json", apikey: key },
    body: JSON.stringify({ email, create_user: false }),
  });
  if (!response.ok) {
    console.error("Supabase OTP request failed", response.status);
    await send(env, chatId, "Impossible d’envoyer le code. Vérifie que cette adresse correspond à un compte existant du site et que la connexion par code e-mail est activée, puis réessaie plus tard.");
    return;
  }
  await env.SESSIONS.put(`otp-rate:${chatId}`, JSON.stringify({ sent_at: now }), { expirationTtl: 600 });
  await putState(env, chatId, { step: "connect_otp", connect: { email, attempts: 0, requested_at: now } });
  await send(env, chatId, "📩 Si cette adresse correspond à un compte existant et que les codes e-mail sont activés, un code vient d’être envoyé. Saisis le code reçu ici. Il expirera selon les paramètres Supabase. Ne le partage avec personne.\n\nTu peux utiliser /cancel pour arrêter.");
}

async function verifyEmailOtp(env, chatId, code) {
  const state = await getState(env, chatId);
  const c = state.connect || {};
  if (state.step !== "connect_otp" || !c.email) {
    await send(env, chatId, "Aucune vérification en cours. Lance /connect pour commencer.");
    return;
  }
  const attempts = Number(c.attempts || 0) + 1;
  if (attempts > 5) {
    await clearState(env, chatId);
    await send(env, chatId, "Trop de tentatives. Relance /connect dans quelques minutes.", menu());
    return;
  }
  if (!/^[0-9]{6,8}$/.test(code)) {
    c.attempts = attempts;
    state.connect = c;
    await putState(env, chatId, state);
    await send(env, chatId, "Le code doit contenir 6 à 8 chiffres. Réessaie ou utilise /cancel.");
    return;
  }
  const url = (env.SUPABASE_URL || "").replace(/\/$/, "");
  const key = env.SUPABASE_ANON_KEY || "";
  const response = await fetch(`${url}/auth/v1/verify`, {
    method: "POST",
    headers: { "content-type": "application/json", apikey: key },
    body: JSON.stringify({ type: "email", email: c.email, token: code }),
  });
  if (!response.ok) {
    console.error("Supabase OTP verification failed", response.status);
    c.attempts = attempts;
    state.connect = c;
    await putState(env, chatId, state);
    await send(env, chatId, attempts >= 5 ? "Vérification échouée. Relance /connect pour recommencer." : "Code incorrect ou expiré. Vérifie l’e-mail et réessaie.");
    if (attempts >= 5) await clearState(env, chatId);
    return;
  }
  const auth = await response.json();
  const userId = auth.user?.id;
  if (!userId) {
    await clearState(env, chatId);
    await send(env, chatId, "La vérification n’a pas renvoyé de compte valide. Réessaie plus tard.", menu());
    return;
  }
  const existing = await env.SESSIONS.get(`user-link:${userId}`, "json");
  if (existing?.chat_id && String(existing.chat_id) !== String(chatId)) {
    await clearState(env, chatId);
    await send(env, chatId, "Ce compte du site est déjà associé à un autre compte Telegram. Contacte l’assistance HUNTERS ANIMES si tu penses qu’il s’agit d’une erreur.", menu());
    return;
  }
  const record = { user_id: userId, linked_at: new Date().toISOString() };
  await env.SESSIONS.put(`telegram-link:${chatId}`, JSON.stringify(record));
  await env.SESSIONS.put(`user-link:${userId}`, JSON.stringify({ chat_id: String(chatId), linked_at: record.linked_at }));
  await clearState(env, chatId);
  await send(env, chatId, "✅ Ton compte Carte Otaku a été vérifié et lié à ce compte Telegram.\n\nPour le moment, cette liaison est stockée dans Cloudflare KV ; aucune carte n’a été créée et aucun historique du site n’a été modifié.", menu());
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
  const photo = Array.isArray(message.photo) && message.photo.length ? message.photo[message.photo.length - 1] : null;
  if (!text && !photo) return;
  if (text === "/start" || text === "/help") {
    await clearState(env, chatId);
    await send(env, chatId,
      "👋 Bienvenue dans Otaku Card Maker !\n\nTu peux préparer les informations de ton profil et lier ton compte du site avec /connect. La génération PNG n’est pas encore activée dans cette version Cloudflare.",
      menu());
    return;
  }
  if (text === "/connect") {
    await startConnect(env, chatId);
    return;
  }
  if (text === "/cancel") {
    await clearState(env, chatId);
    await send(env, chatId, "Opération annulée.", menu());
    return;
  }
  const state = await getState(env, chatId);
  if (state.step === "connect_email") {
    const email = text.toLowerCase();
    if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      await send(env, chatId, "Cette adresse e-mail ne semble pas valide. Réessaie ou utilise /cancel.");
      return;
    }
    await requestEmailOtp(env, chatId, email);
    return;
  }
  if (state.step === "connect_otp") {
    await verifyEmailOtp(env, chatId, text);
    return;
  }
  const p = state.profile || {};
  const value = text.slice(0, 180);
  if (state.step === "photo") {
    if (photo) p.photo_file_id = photo.file_id;
    else if (text !== "—") {
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
  } else if (data === "connect") {
    await startConnect(env, chatId);
    await telegram(env, "editMessageText", { chat_id: chatId, message_id: messageId, text: "🔐 Liaison de compte", reply_markup: homeKeyboard() });
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
      text: `🔎 Récapitulatif de ta carte\n\nPseudo : ${p.username || "Non renseigné"}\nNom réel : ${p.name}\nNationalité : ${p.nationality || "Non renseignée"}\nStatut : ${p.status || "Non renseigné"}\nGenre : ${p.genre || "Non renseigné"}\nCitation : ${p.quote || "Non renseignée"}\nPhoto : ${p.photo_file_id ? "Ajoutée" : "Aucune"}\nCouleur : ${p.color}\n\n⚠️ La génération PNG n’est pas encore activée dans cette version. Aucune carte ni donnée n’est enregistrée dans l’historique du site.`,
      reply_markup: { inline_keyboard: [
        [{ text: "✅ Confirmer le profil", callback_data: "confirm" }],
        [{ text: "🔄 Recommencer", callback_data: "create" }],
        [{ text: "↩️ Menu", callback_data: "home" }],
      ] },
    });
  } else if (data === "confirm") {
    await telegram(env, "editMessageText", {
      chat_id: chatId, message_id: messageId,
      text: "✅ Profil confirmé. La génération et l’envoi PNG ne sont pas encore implémentés dans cette version. Aucune carte n’a été enregistrée sur le site.",
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

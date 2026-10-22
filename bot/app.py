"""Telegram entry point and guided Otaku card profile flow."""
import logging
import re
from telegram import InlineKeyboardButton, InlineKeyboardMarkup, Update
from telegram.ext import Application, CallbackQueryHandler, CommandHandler, ContextTypes, MessageHandler, filters
from bot.config import configure_logging, load_settings
from bot.supabase_catalog import CatalogUnavailable, fetch_active_templates

logger = logging.getLogger(__name__)
WEBSITE_URL = "https://ryah001.github.io/otaku-card-maker/"
COLORS = ["Bleu", "Vert", "Orange", "Violet", "Jaune", "Rouge"]

def menu():
    return InlineKeyboardMarkup([
        [InlineKeyboardButton("🎴 Créer ma carte", callback_data="create")],
        [InlineKeyboardButton("🎨 Modèles actifs", callback_data="templates")],
        [InlineKeyboardButton("🌐 Ouvrir le site", url=WEBSITE_URL)],
    ])

def cancel_keyboard():
    return InlineKeyboardMarkup([[InlineKeyboardButton("↩️ Annuler", callback_data="home")]])

def color_keyboard():
    return InlineKeyboardMarkup([[InlineKeyboardButton(c, callback_data=f"color:{c}")] for c in COLORS] +
                                [[InlineKeyboardButton("↩️ Annuler", callback_data="home")]])

async def start(update: Update, context: ContextTypes.DEFAULT_TYPE):
    context.user_data.clear()
    await update.effective_message.reply_text(
        "👋 Bienvenue dans Otaku Card Maker !\n\nTu peux préparer les informations de ton profil. "
        "La génération PNG et la liaison sécurisée du compte ne sont pas encore activées.", reply_markup=menu())

async def help_command(update: Update, context: ContextTypes.DEFAULT_TYPE):
    await update.effective_message.reply_text(
        "Commandes : /start pour le menu, /help pour l’aide, /cancel pour annuler.\n"
        "Le bot ne demandera jamais ton mot de passe Google ni ton identifiant HUNTER.", reply_markup=menu())

async def cancel(update: Update, context: ContextTypes.DEFAULT_TYPE):
    context.user_data.clear()
    await update.effective_message.reply_text("Création annulée.", reply_markup=menu())

async def begin(query, context):
    context.user_data.clear()
    context.user_data["profile"] = {}
    context.user_data["step"] = "name"
    await query.edit_message_text("🎴 Étape 1/5 — Quel nom veux-tu afficher ? Envoie-le ici. (/cancel pour arrêter)")

async def show_templates(query):
    try:
        templates = await fetch_active_templates()
    except CatalogUnavailable:
        await query.edit_message_text(
            "Le catalogue en direct n’est pas disponible. Configure SUPABASE_URL et SUPABASE_ANON_KEY (clé publique uniquement) dans l’hébergement.",
            reply_markup=cancel_keyboard())
        return
    if not templates:
        await query.edit_message_text("Aucun modèle actif n’est disponible.", reply_markup=cancel_keyboard())
        return
    text = "🎨 Modèles actuellement actifs sur le site :\n\n" + "\n".join("• " + t["label"] for t in templates)
    await query.edit_message_text(text, reply_markup=cancel_keyboard())

async def show_review(query, context):
    p = context.user_data.get("profile", {})
    text = ("🔎 Récapitulatif du profil\n\n"
            f"Nom : {p.get('name', '—')}\nPseudo : {p.get('username') or 'Non renseigné'}\n"
            f"Rôle : {p.get('role') or 'Non renseigné'}\nDescription : {p.get('bio') or 'Non renseignée'}\n"
            f"WhatsApp : {p.get('whatsapp') or 'Non renseigné'}\nCouleur : {p.get('color', '—')}\n\n"
            "Le profil est préparé, mais aucune image n’a été générée et rien n’a été enregistré sur le site.")
    await query.edit_message_text(text, reply_markup=InlineKeyboardMarkup([
        [InlineKeyboardButton("✅ Confirmer le profil", callback_data="confirm")],
        [InlineKeyboardButton("🔄 Recommencer", callback_data="create")],
        [InlineKeyboardButton("↩️ Menu", callback_data="home")],
    ]))

async def buttons(update: Update, context: ContextTypes.DEFAULT_TYPE):
    q = update.callback_query
    await q.answer()
    data = q.data or ""
    if data == "home":
        context.user_data.clear()
        await q.edit_message_text("Menu principal :", reply_markup=menu())
    elif data == "create":
        await begin(q, context)
    elif data == "templates":
        await show_templates(q)
    elif data.startswith("color:"):
        p = context.user_data.get("profile")
        color = data.split(":", 1)[1]
        if not p or color not in COLORS:
            await q.edit_message_text("Session expirée. Relance /start.", reply_markup=menu())
            return
        p["color"] = color
        await show_review(q, context)
    elif data == "confirm":
        await q.edit_message_text(
            "✅ Profil préparé. La génération PNG doit encore être reliée au composant React officiel et à la vérification sécurisée du compte. Rien n’a été enregistré dans l’historique.",
            reply_markup=InlineKeyboardMarkup([
                [InlineKeyboardButton("🌐 Ouvrir le site", url=WEBSITE_URL)],
                [InlineKeyboardButton("🎴 Nouveau profil", callback_data="create")],
                [InlineKeyboardButton("↩️ Menu", callback_data="home")],
            ]))

async def collect_text(update: Update, context: ContextTypes.DEFAULT_TYPE):
    step = context.user_data.get("step")
    p = context.user_data.get("profile")
    m = update.effective_message
    if not step or p is None or not m or not m.text:
        return
    value = m.text.strip()
    if step == "name":
        if not 2 <= len(value) <= 50:
            await m.reply_text("Le nom doit contenir entre 2 et 50 caractères.")
            return
        p["name"] = value
        context.user_data["step"] = "username"
        await m.reply_text("Étape 2/5 — Ton pseudo, ou — pour ignorer.")
    elif step == "username":
        p["username"] = "" if value == "—" else value[:40]
        context.user_data["step"] = "role"
        await m.reply_text("Étape 3/5 — Ton rôle/titre, ou — pour ignorer.")
    elif step == "role":
        p["role"] = "" if value == "—" else value[:60]
        context.user_data["step"] = "bio"
        await m.reply_text("Étape 4/5 — Courte description, ou — pour ignorer.")
    elif step == "bio":
        p["bio"] = "" if value == "—" else value[:180]
        context.user_data["step"] = "whatsapp"
        await m.reply_text("Étape 5/5 — Numéro WhatsApp international, ou — pour ignorer.")
    elif step == "whatsapp":
        if value != "—":
            digits = re.sub(r"\\D", "", value)
            if not 8 <= len(digits) <= 15:
                await m.reply_text("Numéro invalide. Envoie l’indicatif international ou —.")
                return
            p["whatsapp"] = digits
        else:
            p["whatsapp"] = ""
        context.user_data.pop("step", None)
        await m.reply_text("Choisis une couleur :", reply_markup=color_keyboard())

def build_application():
    settings = load_settings()
    configure_logging(settings.log_level)
    app = Application.builder().token(settings.telegram_bot_token).build()
    app.add_handler(CommandHandler("start", start))
    app.add_handler(CommandHandler("help", help_command))
    app.add_handler(CommandHandler("cancel", cancel))
    app.add_handler(CallbackQueryHandler(buttons))
    app.add_handler(MessageHandler(filters.TEXT & ~filters.COMMAND, collect_text))
    return app

def main():
    app = build_application()
    logger.info("Starting Otaku Card Telegram bot")
    app.run_polling(allowed_updates=Update.ALL_TYPES)

if __name__ == "__main__":
    main()

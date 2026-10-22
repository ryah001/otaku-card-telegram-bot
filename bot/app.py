"""Telegram entry point and guided Otaku card profile flow."""

import logging
import re
from telegram import InlineKeyboardButton, InlineKeyboardMarkup, Update
from telegram.ext import (Application, CallbackQueryHandler, CommandHandler,
                          ContextTypes, MessageHandler, filters)
from bot.config import configure_logging, load_settings

logger = logging.getLogger(__name__)
WEBSITE_URL = "https://ryah001.github.io/otaku-card-maker/"
COLORS = ["Bleu", "Vert", "Orange", "Violet", "Jaune", "Rouge"]


def main_menu() -> InlineKeyboardMarkup:
    return InlineKeyboardMarkup([
        [InlineKeyboardButton("🎴 Créer ma carte", callback_data="create:start")],
        [InlineKeyboardButton("🎨 Modèles et couleurs", callback_data="templates:list")],
        [InlineKeyboardButton("🌐 Ouvrir Otaku Card Maker", url=WEBSITE_URL)],
        [InlineKeyboardButton("❔ Aide", callback_data="help:show")],
    ])


def color_keyboard() -> InlineKeyboardMarkup:
    rows = [[InlineKeyboardButton(c, callback_data=f"color:{c}")] for c in COLORS]
    rows.append([InlineKeyboardButton("↩️ Annuler", callback_data="menu:home")])
    return InlineKeyboardMarkup(rows)


def review_keyboard() -> InlineKeyboardMarkup:
    return InlineKeyboardMarkup([
        [InlineKeyboardButton("✅ Confirmer le profil", callback_data="profile:confirm")],
        [InlineKeyboardButton("🔄 Recommencer", callback_data="create:start")],
        [InlineKeyboardButton("❌ Annuler", callback_data="menu:home")],
    ])


async def start(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    context.user_data.clear()
    if update.effective_message:
        await update.effective_message.reply_text(
            "👋 Bienvenue dans Otaku Card Maker !\n\n"
            "Prépare ton profil de carte étape par étape. La génération PNG et la liaison sécurisée du compte sont encore en cours d’intégration.",
            reply_markup=main_menu())


async def help_command(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    text = ("Commandes disponibles :\n/start — ouvrir le menu\n/help — afficher cette aide\n\n"
            "Le bot ne te demandera jamais ton mot de passe Google ni ton identifiant HUNTER. "
            "La création finale sera activée après raccordement au moteur sécurisé du site.")
    if update.effective_message:
        await update.effective_message.reply_text(text, reply_markup=main_menu())


async def begin_profile(query, context: ContextTypes.DEFAULT_TYPE) -> None:
    context.user_data.clear()
    context.user_data["profile"] = {}
    context.user_data["profile_step"] = "name"
    await query.edit_message_text("🎴 Création de ta carte\n\n1/5 — Quel nom veux-tu afficher sur la carte ?\n\nEnvoie le nom dans le chat.")


async def button_handler(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    query = update.callback_query
    if not query:
        return
    await query.answer()
    data = query.data or ""
    if data == "menu:home":
        context.user_data.clear()
        await query.edit_message_text("Menu principal — que veux-tu faire ?", reply_markup=main_menu())
    elif data == "create:start":
        await begin_profile(query, context)
    elif data == "templates:list":
        await query.edit_message_text(
            "🎨 Les modèles et couleurs actifs seront chargés depuis Supabase après configuration du backend.\n\n"
            "Couleurs prévues : bleu, vert, orange, violet, jaune et rouge.",
            reply_markup=InlineKeyboardMarkup([[InlineKeyboardButton("↩️ Menu", callback_data="menu:home")]]))
    elif data == "help:show":
        await query.edit_message_text(
            "Utilise « Créer ma carte » pour préparer les informations du profil.\n"
            "La génération d’image et la liaison du compte ne sont pas encore activées.",
            reply_markup=InlineKeyboardMarkup([[InlineKeyboardButton("↩️ Menu", callback_data="menu:home")]]))
    elif data.startswith("color:"):
        color = data.split(":", 1)[1]
        profile = context.user_data.get("profile")
        if not profile:
            await query.edit_message_text("La session a expiré. Relance /start.", reply_markup=main_menu())
            return
        profile["color"] = color
        await show_review(query, context)
    elif data == "profile:confirm":
        await query.edit_message_text(
            "✅ Profil préparé !\n\nLa prochaine étape technique est le raccordement au moteur de rendu officiel du site et à la vérification de compte. Aucune carte PNG n’a encore été générée et rien n’a été enregistré dans l’historique du site.",
            reply_markup=InlineKeyboardMarkup([
                [InlineKeyboardButton("🌐 Créer une carte sur le site", url=WEBSITE_URL)],
                [InlineKeyboardButton("🎴 Préparer un autre profil", callback_data="create:start")],
                [InlineKeyboardButton("↩️ Menu", callback_data="menu:home")],
            ]))


async def show_review(query, context: ContextTypes.DEFAULT_TYPE) -> None:
    p = context.user_data.get("profile", {})
    whatsapp = p.get("whatsapp") or "Non renseigné"
    text = ("🔎 Vérifie les informations de ton profil :\n\n"
            f"Nom : {p.get('name', '—')}\n"
            f"Pseudo : {p.get('username') or 'Non renseigné'}\n"
            f"Rôle / titre : {p.get('role') or 'Non renseigné'}\n"
            f"Description : {p.get('bio') or 'Non renseignée'}\n"
            f"WhatsApp : {whatsapp}\n"
            f"Couleur choisie : {p.get('color', '—')}\n\n"
            "Ce récapitulatif prépare les données ; il ne constitue pas encore une carte générée.")
    await query.edit_message_text(text, reply_markup=review_keyboard())


async def profile_text(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    step = context.user_data.get("profile_step")
    profile = context.user_data.get("profile")
    message = update.effective_message
    if not step or profile is None or message is None or not message.text:
        return
    value = message.text.strip()
    if value.lower() in {"annuler", "/cancel"}:
        context.user_data.clear()
        await message.reply_text("Création annulée.", reply_markup=main_menu())
        return
    if step == "name":
        if not 2 <= len(value) <= 50:
            await message.reply_text("Le nom doit contenir entre 2 et 50 caractères. Réessaie.")
            return
        profile["name"] = value
        context.user_data["profile_step"] = "username"
        await message.reply_text("2/5 — Ton pseudo (ou envoie — pour ignorer).")
    elif step == "username":
        profile["username"] = "" if value == "—" else value[:40]
        context.user_data["profile_step"] = "role"
        await message.reply_text("3/5 — Quel rôle ou titre veux-tu afficher ? (ou — pour ignorer)")
    elif step == "role":
        profile["role"] = "" if value == "—" else value[:60]
        context.user_data["profile_step"] = "bio"
        await message.reply_text("4/5 — Écris une courte description (ou — pour ignorer).")
    elif step == "bio":
        profile["bio"] = "" if value == "—" else value[:180]
        context.user_data["profile_step"] = "whatsapp"
        await message.reply_text("5/5 — Numéro WhatsApp international (ex. 24206XXXXXXX), ou — pour ne pas ajouter de QR.")
    elif step == "whatsapp":
        if value != "—":
            digits = re.sub(r"\D", "", value)
            if not 8 <= len(digits) <= 15:
                await message.reply_text("Numéro invalide. Envoie le numéro avec indicatif international ou — pour ignorer.")
                return
            profile["whatsapp"] = digits
        else:
            profile["whatsapp"] = ""
        context.user_data.pop("profile_step", None)
        await message.reply_text("Choisis une couleur pour ton profil :", reply_markup=color_keyboard())


def build_application() -> Application:
    settings = load_settings()
    configure_logging(settings.log_level)
    app = Application.builder().token(settings.telegram_bot_token).build()
    app.add_handler(CommandHandler("start", start))
    app.add_handler(CommandHandler("help", help_command))
    app.add_handler(CommandHandler("cancel", help_command))
    app.add_handler(CallbackQueryHandler(button_handler))
    app.add_handler(MessageHandler(filters.TEXT & ~filters.COMMAND, profile_text))
    return app


def main() -> None:
    app = build_application()
    logger.info("Starting Otaku Card Telegram bot")
    app.run_polling(allowed_updates=Update.ALL_TYPES)


if __name__ == "__main__":
    main()

"""Telegram entry point and initial conversation menu."""

import logging

from telegram import InlineKeyboardButton, InlineKeyboardMarkup, Update
from telegram.ext import Application, CallbackQueryHandler, CommandHandler, ContextTypes

from bot.config import configure_logging, load_settings

logger = logging.getLogger(__name__)

WELCOME_TEXT = (
    "🎴 Bienvenue dans Otaku Card Maker !\n\n"
    "Crée ta carte Otaku en quelques étapes. Le générateur et la liaison de compte "
    "seront activés après configuration du backend sécurisé.\n\n"
    "Choisis une option ci-dessous."
)


def main_menu() -> InlineKeyboardMarkup:
    return InlineKeyboardMarkup(
        [
            [InlineKeyboardButton("🪪 Créer ma carte", callback_data="create:start")],
            [InlineKeyboardButton("🎨 Modèles et couleurs", callback_data="templates:list")],
            [InlineKeyboardButton("🌐 Ouvrir Otaku Card Maker", url="https://ryah001.github.io/otaku-card-maker/")],
            [InlineKeyboardButton("ℹ️ Aide", callback_data="help:show")],
        ]
    )


async def start(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    if update.effective_message:
        await update.effective_message.reply_text(WELCOME_TEXT, reply_markup=main_menu())


async def help_command(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    text = (
        "Commandes disponibles :\n"
        "/start — ouvrir le menu principal\n"
        "/help — afficher cette aide\n\n"
        "La création complète sera disponible lorsque le rendu partagé et la liaison "
        "sécurisée au compte auront été implémentés. Ne partage jamais ton token Telegram."
    )
    if update.effective_message:
        await update.effective_message.reply_text(text, reply_markup=main_menu())


async def button_handler(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    query = update.callback_query
    if not query:
        return
    await query.answer()

    if query.data == "help:show":
        await query.edit_message_text(
            "ℹ️ Aide\n\nUtilise /start pour revenir au menu. La génération des cartes "
            "nécessite encore le backend sécurisé et le moteur de rendu du site.",
            reply_markup=InlineKeyboardMarkup(
                [[InlineKeyboardButton("⬅️ Menu", callback_data="menu:home")]]
            ),
        )
    elif query.data == "menu:home":
        await query.edit_message_text(WELCOME_TEXT, reply_markup=main_menu())
    elif query.data == "create:start":
        await query.edit_message_text(
            "🛠️ Le parcours de création est en préparation.\n\n"
            "Avant d'accepter des données personnelles ou de générer une carte, "
            "le bot doit être relié au backend sécurisé du site. Aucun identifiant "
            "HUNTERS ne sera demandé ou inventé par le bot.",
            reply_markup=InlineKeyboardMarkup(
                [[InlineKeyboardButton("⬅️ Menu", callback_data="menu:home")]]
            ),
        )
    elif query.data == "templates:list":
        await query.edit_message_text(
            "🎨 Les modèles actifs seront chargés directement depuis Supabase. "
            "Cette fonction sera activée avec la connexion backend.",
            reply_markup=InlineKeyboardMarkup(
                [[InlineKeyboardButton("⬅️ Menu", callback_data="menu:home")]]
            ),
        )


def build_application() -> Application:
    settings = load_settings()
    configure_logging(settings.log_level)
    application = Application.builder().token(settings.telegram_bot_token).build()
    application.add_handler(CommandHandler("start", start))
    application.add_handler(CommandHandler("help", help_command))
    application.add_handler(CallbackQueryHandler(button_handler))
    return application


def main() -> None:
    application = build_application()
    logger.info("Starting Otaku Card Telegram Bot")
    application.run_polling(allowed_updates=Update.ALL_TYPES)

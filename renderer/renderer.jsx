import React from "react";
import { createRoot } from "react-dom/client";
import OtakuCard from "./src/OtakuCard.jsx";
import { BUILTIN_TEMPLATE_CATALOG } from "./src/lib/cardTemplates.js";
import "./src/index.css";
import "./renderer.css";

const params = new URLSearchParams(window.location.search);
const profile = {
  username: params.get("username") || "otaku_preview",
  realName: params.get("realName") || "Otaku Preview",
  nationality: params.get("nationality") || "Congolaise",
  status: params.get("status") || "Chasseur",
  genre: params.get("genre") || "Shonen",
  quote: params.get("quote") || "La chasse est ouverte.",
  quote2: params.get("quote2") || "HUNTERS ANIMES",
  color: params.get("color") || "blue",
  cardNumber: params.get("cardNumber") || "HUNTER ------",
  hasWhatsappQr: false,
  whatsappNumber: "",
};

createRoot(document.getElementById("renderer-root")).render(
  <React.StrictMode>
    <OtakuCard profile={profile} templateCatalog={BUILTIN_TEMPLATE_CATALOG} previewOnly />
  </React.StrictMode>,
);

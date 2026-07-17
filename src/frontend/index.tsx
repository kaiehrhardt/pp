import { createRoot } from "react-dom/client";
import { I18nextProvider } from "react-i18next";
import { App } from "./App";
import { i18next } from "./i18n";
import "./styles.css";

const container = document.getElementById("root");
if (!container) throw new Error("#root not found");

createRoot(container).render(
  <I18nextProvider i18n={i18next}>
    <App />
  </I18nextProvider>,
);

/* ============================================================
   Carolina Core Wellness — 2026 Revenue Dashboard
   Runtime configuration
   ============================================================
   DATA_URL points to the dashboard's revenue data (plain JSON).
   The dashboard is a public static site — anyone with the URL
   can view these figures. (The previous in-browser AES layer was
   removed: the passphrase shipped in this public file, so it
   added fragility — it broke loading in any non-secure context,
   e.g. file:// or in-app browsers — with no real security.)
   ============================================================ */
window.GFP_CONFIG = {
  DATA_URL: "data.json"
};

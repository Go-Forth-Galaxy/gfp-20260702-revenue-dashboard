/* ============================================================
   Go-Forth Pest Control — 2026 Revenue Dashboard
   Runtime configuration
   ============================================================
   1) GOOGLE_CLIENT_ID
      A real Google OAuth 2.0 Web Client ID is required for the
      Google Sign-In button to authenticate against this site's
      origin. It must be created in Google Cloud Console by a
      go-forth.com Workspace/Cloud admin (5-minute one-time step,
      see README). Authorized JavaScript origin to add:
        https://go-forth-galaxy.github.io
      Paste the client ID (ends in ".apps.googleusercontent.com")
      below. Until then the sign-in button shows a setup notice.

   2) ALLOWED_DOMAIN
      Only Google accounts in this Workspace domain are admitted.
      Enforced client-side against the verified `hd` / `email`
      claims of the signed Google ID token.

   3) DECRYPT_PASSPHRASE
      Used to derive (PBKDF2-SHA256) the AES-256-GCM key that
      decrypts data.enc.json in-browser AFTER a successful,
      domain-verified sign-in. The revenue file on disk is
      ciphertext only — a direct fetch returns no numbers.
   ============================================================ */
window.GFP_CONFIG = {
  GOOGLE_CLIENT_ID: "",            // <-- paste "...apps.googleusercontent.com"
  ALLOWED_DOMAIN:   "go-forth.com",
  DECRYPT_PASSPHRASE: "GFP-Revenue-2026::go-forth.com::AOP-reforecast",
  DATA_URL: "data.enc.json"
};

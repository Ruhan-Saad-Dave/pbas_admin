import { api } from "../api/client";

/**
 * Reads Keycloak SSO configuration for Admin Portal from runtime config (window.APP_CONFIG)
 * or Vite environment variables.
 */
export const getKeycloakConfig = () => {
  const runtime = (typeof window !== "undefined" && window.APP_CONFIG) || {};
  const env = import.meta.env || {};

  const keycloakUrl = (
    runtime.VITE_KEYCLOAK_URL ||
    env.VITE_KEYCLOAK_URL ||
    ""
  ).replace(/\/$/, "");

  const realm = runtime.VITE_KEYCLOAK_REALM || env.VITE_KEYCLOAK_REALM || "dypiu";
  const clientId = runtime.VITE_KEYCLOAK_CLIENT_ID || env.VITE_KEYCLOAK_CLIENT_ID || "faculty-appraisal-admin";
  const scopes = runtime.VITE_KEYCLOAK_SCOPES || env.VITE_KEYCLOAK_SCOPES || "openid email profile";

  return {
    keycloakUrl,
    realm,
    clientId,
    scopes,
    isConfigured: Boolean(keycloakUrl),
  };
};

function generateRandomString(length = 64) {
  const charset = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~";
  const randomValues = new Uint8Array(length);
  if (typeof window !== "undefined" && window.crypto) {
    window.crypto.getRandomValues(randomValues);
  } else {
    for (let i = 0; i < length; i++) {
      randomValues[i] = Math.floor(Math.random() * 256);
    }
  }
  return Array.from(randomValues)
    .map((val) => charset[val % charset.length])
    .join("");
}

function base64UrlEncode(arrayBuffer) {
  const bytes = new Uint8Array(arrayBuffer);
  let binary = "";
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

async function sha256(plain) {
  const encoder = new TextEncoder();
  const data = encoder.encode(plain);
  return await window.crypto.subtle.digest("SHA-256", data);
}

/**
 * Initiates Keycloak OIDC Authorization Code Flow with PKCE for Admin Portal.
 */
export const initiateKeycloakLogin = async (customRedirectUri = null) => {
  const { keycloakUrl, realm, clientId, scopes, isConfigured } = getKeycloakConfig();
  if (!isConfigured) {
    throw new Error("Keycloak SSO is not configured for Admin Portal.");
  }

  const codeVerifier = generateRandomString(64);
  const state = generateRandomString(32);
  const hashed = await sha256(codeVerifier);
  const codeChallenge = base64UrlEncode(hashed);

  sessionStorage.setItem("admin_sso_pkce_verifier", codeVerifier);
  sessionStorage.setItem("admin_sso_pkce_state", state);

  const redirectUri = customRedirectUri || window.location.href.split("?")[0].split("#")[0];
  sessionStorage.setItem("admin_sso_redirect_uri", redirectUri);

  const authUrl = new URL(`${keycloakUrl}/realms/${encodeURIComponent(realm)}/protocol/openid-connect/auth`);
  authUrl.searchParams.set("client_id", clientId);
  authUrl.searchParams.set("redirect_uri", redirectUri);
  authUrl.searchParams.set("response_type", "code");
  authUrl.searchParams.set("scope", scopes);
  authUrl.searchParams.set("code_challenge", codeChallenge);
  authUrl.searchParams.set("code_challenge_method", "S256");
  authUrl.searchParams.set("state", state);

  window.location.href = authUrl.toString();
};

/**
 * Exchanges Keycloak authorization code for access token.
 */
export const exchangeKeycloakCode = async (code, returnedState) => {
  const { keycloakUrl, realm, clientId } = getKeycloakConfig();
  const savedState = sessionStorage.getItem("admin_sso_pkce_state");
  const codeVerifier = sessionStorage.getItem("admin_sso_pkce_verifier");
  const redirectUri = sessionStorage.getItem("admin_sso_redirect_uri") || window.location.href.split("?")[0].split("#")[0];

  sessionStorage.removeItem("admin_sso_pkce_state");
  sessionStorage.removeItem("admin_sso_pkce_verifier");
  sessionStorage.removeItem("admin_sso_redirect_uri");

  if (savedState && returnedState && savedState !== returnedState) {
    throw new Error("Invalid SSO state. CSRF validation failed.");
  }
  if (!codeVerifier) {
    throw new Error("PKCE verifier missing. Please try logging in again.");
  }

  const tokenUrl = `${keycloakUrl}/realms/${encodeURIComponent(realm)}/protocol/openid-connect/token`;

  const body = new URLSearchParams();
  body.set("grant_type", "authorization_code");
  body.set("client_id", clientId);
  body.set("code", code);
  body.set("redirect_uri", redirectUri);
  body.set("code_verifier", codeVerifier);

  const res = await fetch(tokenUrl, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });

  const data = await res.json().catch(() => null);

  if (!res.ok || !data?.access_token) {
    const errorMsg = data?.error_description || data?.error || `SSO token exchange failed (${res.status})`;
    throw new Error(errorMsg);
  }

  return data.access_token;
};

/**
 * Validates the token with backend /auth/me, verifies admin role, and saves admin profile.
 */
export const processAdminSsoToken = async (token) => {
  return await api.processSsoToken(token);
};

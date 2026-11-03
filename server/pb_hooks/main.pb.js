/// <reference path="../pb_data/types.d.ts" />

/**
 * On every startup, sync runtime config from environment variables so the
 * deployment is configured entirely from Coolify (no admin-UI clicking):
 *   GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET  -> users collection Google OAuth2
 *   APP_URL                                 -> Settings > Application URL
 */
onBootstrap((e) => {
  e.next();

  const clientId = ($os.getenv("GOOGLE_CLIENT_ID") || "").trim();
  const clientSecret = ($os.getenv("GOOGLE_CLIENT_SECRET") || "").trim();
  const appUrl = ($os.getenv("APP_URL") || "").trim();

  if (appUrl) {
    const settings = e.app.settings();
    if (settings.meta.appURL !== appUrl) {
      settings.meta.appURL = appUrl;
      settings.meta.appName = "Daily Devotion";
      e.app.save(settings);
    }
  }

  const users = e.app.findCollectionByNameOrId("users");

  // Keep sign-ins for 30 days (refreshed on each app open) instead of the
  // 7-day default, so users aren't asked to log in again every week.
  users.authToken.duration = 30 * 24 * 60 * 60;

  if (clientId && clientSecret) {
    users.oauth2.enabled = true;
    users.oauth2.providers = [{
      name: "google",
      clientId: clientId,
      clientSecret: clientSecret,
    }];
    users.oauth2.mappedFields.name = "name";
    users.oauth2.mappedFields.avatarURL = "avatar";
  } else {
    console.warn("[ddcatholic] GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET not set - Google sign-in disabled");
  }

  e.app.save(users);
});

/**
 * HTTP caching for the static app. Without explicit headers Cloudflare caches
 * .js/.css for 4 hours, so deploys didn't show up. App code and the service
 * worker must always be revalidated; heavy immutable assets can be cached.
 */
routerUse((e) => {
  const path = e.request.url.path || "/";
  if (!path.startsWith("/api/") && !path.startsWith("/_/")) {
    const longLived = /^\/(assets\/(icons|audio|vendor)|epubs)\//.test(path) || path === "/favicon.ico";
    e.response.header().set("Cache-Control", longLived ? "public, max-age=604800" : "no-cache");
  }
  return e.next();
});

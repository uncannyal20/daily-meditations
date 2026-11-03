/// <reference path="../pb_data/types.d.ts" />

/**
 * Initial schema for Daily Devotion:
 *  - users.profile (json): settings, bookmarks, streak, lastActiveDate
 *  - journal_entries: one record per completed meditation, owned by a user
 *
 * Users sign in with Google only (password auth disabled). The Google
 * client id/secret are applied at startup from env vars in pb_hooks.
 */
migrate((app) => {
  const users = app.findCollectionByNameOrId("users");

  if (!users.fields.getByName("profile")) {
    users.fields.add(new JSONField({ name: "profile", maxSize: 200000 }));
  }
  users.passwordAuth.enabled = false;
  app.save(users);

  const ownerOnly = "user = @request.auth.id";

  const entries = new Collection({
    type: "base",
    name: "journal_entries",
    listRule: ownerOnly,
    viewRule: ownerOnly,
    createRule: "@request.auth.id != '' && @request.body.user = @request.auth.id",
    updateRule: ownerOnly + " && (@request.body.user:isset = false || @request.body.user = @request.auth.id)",
    deleteRule: ownerOnly,
    fields: [
      {
        type: "relation",
        name: "user",
        required: true,
        collectionId: users.id,
        maxSelect: 1,
        cascadeDelete: true,
      },
      { type: "text", name: "client_id", required: true, max: 64 },
      { type: "text", name: "date", required: true, max: 10, pattern: "^\\d{4}-\\d{2}-\\d{2}$" },
      { type: "text", name: "meditation_id", max: 120 },
      { type: "text", name: "book_title", max: 300 },
      { type: "text", name: "chapter_title", max: 300 },
      { type: "number", name: "duration_minutes", min: 0, max: 1440, onlyInt: true },
      { type: "text", name: "resolution", max: 5000 },
      { type: "autodate", name: "created", onCreate: true },
      { type: "autodate", name: "updated", onCreate: true, onUpdate: true },
    ],
    indexes: [
      "CREATE UNIQUE INDEX idx_journal_user_client ON journal_entries (user, client_id)",
      "CREATE INDEX idx_journal_user_date ON journal_entries (user, date)",
    ],
  });
  app.save(entries);
}, (app) => {
  const entries = app.findCollectionByNameOrId("journal_entries");
  app.delete(entries);

  const users = app.findCollectionByNameOrId("users");
  users.fields.removeByName("profile");
  users.passwordAuth.enabled = true;
  app.save(users);
});

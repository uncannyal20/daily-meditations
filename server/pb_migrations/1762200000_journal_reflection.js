/// <reference path="../pb_data/types.d.ts" />

// Adds the "What struck you most?" reflection to journal entries.
migrate((app) => {
  const entries = app.findCollectionByNameOrId("journal_entries");
  if (!entries.fields.getByName("reflection")) {
    entries.fields.add(new TextField({ name: "reflection", max: 5000 }));
  }
  app.save(entries);
}, (app) => {
  const entries = app.findCollectionByNameOrId("journal_entries");
  entries.fields.removeByName("reflection");
  app.save(entries);
});

/// <reference path="../pb_data/types.d.ts" />

/**
 * Normalizes customer names to Title Case on create and update.
 *
 * Ensures consistent Title Case formatting in the database even if input was
 * sent in all-caps, all-lowercase, or with extra whitespace.
 */

onRecordCreateRequest((e) => {
  const rawName = e.record.get("name");
  if (typeof rawName === "string" && rawName.trim()) {
    const trimmed = rawName.trim().replace(/\s+/g, " ");
    if (trimmed) {
      const formatted = trimmed
        .split(" ")
        .map(function (word) {
          return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
        })
        .join(" ");
      e.record.set("name", formatted);
    }
  }
  e.next();
}, "customers");

onRecordUpdateRequest((e) => {
  const rawName = e.record.get("name");
  if (typeof rawName === "string" && rawName.trim()) {
    const trimmed = rawName.trim().replace(/\s+/g, " ");
    if (trimmed) {
      const formatted = trimmed
        .split(" ")
        .map(function (word) {
          return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
        })
        .join(" ");
      e.record.set("name", formatted);
    }
  }
  e.next();
}, "customers");

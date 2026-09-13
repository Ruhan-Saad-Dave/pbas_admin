// Shared local cache of label/desc/color/icon for backend-managed form families.
// The backend has no columns for these (see Docs/form_builder_backend_changes.md) —
// src/pages/forms/DynamicFormPage.jsx writes here when a schema is saved, and
// src/utils/backendFormFamilies.js reads it to give the school Form Picker a nicer
// label than a raw family id.

const META_KEY = 'pbas_backend_form_metadata';

export function readFormMetadata() {
  try { return JSON.parse(localStorage.getItem(META_KEY) || '{}'); } catch { return {}; }
}

export function writeFormMetadata(meta) {
  try { localStorage.setItem(META_KEY, JSON.stringify(meta)); } catch {}
}

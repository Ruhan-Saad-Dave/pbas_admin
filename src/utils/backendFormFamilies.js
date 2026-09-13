// Live list of admin-published custom appraisal form families, sourced from the
// real backend (`GET /admin/form-schema`) — NOT from the old browser-only
// dynamicFormRegistry.js prototype. This is what schoolRoles.js's
// getAllSchoolForms() merges into the school Form Picker, so a school can only
// ever be assigned a family the backend will actually accept.
//
// A family qualifies as a selectable "custom" form when:
//   - at least one of its sections is active (so validate_and_resolve_form_config's
//     backend-side existence check — see Docs/form_builder_backend_changes.md §2.2 —
//     will actually find it), and
//   - every one of its sections has storage_table === null (fully admin-created;
//     the built-in PBAS families like "all_teaching"/"design_arts" have real
//     storage tables and are already covered by the Standard/Creative options).

import { useState, useEffect } from 'react';
import { api } from '../api/client';
import { readFormMetadata } from './backendFormMetadata';

const CHANGE_EVENT = 'custom-form-families-changed';

let cache = [];
let loaded = false;
let inflight = null;

function buildFamilyList(rows, meta) {
  const byFamily = new Map();
  for (const r of rows || []) {
    const fam = r.form_family;
    if (!fam) continue;
    if (!byFamily.has(fam)) byFamily.set(fam, []);
    byFamily.get(fam).push(r);
  }
  const forms = [];
  for (const [family, records] of byFamily) {
    const hasActive = records.some(r => r.active);
    const isFullyCustom = records.every(r => !r.storage_table);
    if (!hasActive || !isFullyCustom) continue;
    const m = meta[family] || {};
    // The backend's validate_and_resolve_form_config (form_registry.py) treats
    // `default_form` itself AS the family name for anything that isn't
    // "standard"/"creative" — there's no separate "custom" sentinel value. Its
    // dynamic registry entries set both default_form and form_variant to the
    // same family string, and form_type to `FORM_<FAMILY>` — match that exactly
    // so find_registry_entry() gets a clean match instead of falling through.
    forms.push({
      key: `custom:${family}`,
      defaultForm: family,
      formVariant: family,
      formType: `FORM_${family.toUpperCase().replace(/-/g, '_')}`,
      aliases: [family, `custom:${family}`],
      label: m.label || family,
      iconName: m.iconName || 'doc',
      color: m.color || '#a78bfa',
      desc: m.desc || `Published custom appraisal form (${records.length} section${records.length === 1 ? '' : 's'}).`,
    });
  }
  return forms;
}

export async function loadCustomFormFamilies({ force = false } = {}) {
  if (!force && loaded) return cache;
  if (inflight) return inflight;
  inflight = (async () => {
    const rows = await api.formSchemas.list();
    return buildFamilyList(rows, readFormMetadata());
  })()
    .then(forms => {
      cache = forms;
      loaded = true;
      inflight = null;
      notifyCustomFormFamiliesChanged();
      return forms;
    })
    .catch(err => {
      inflight = null;
      throw err;
    });
  return inflight;
}

export function getCachedCustomFormFamilies() {
  return cache;
}

export function notifyCustomFormFamiliesChanged() {
  try { window.dispatchEvent(new CustomEvent(CHANGE_EVENT)); } catch {}
}

export function onCustomFormFamiliesChanged(cb) {
  window.addEventListener(CHANGE_EVENT, cb);
  return () => window.removeEventListener(CHANGE_EVENT, cb);
}

// Convenience hook for any component that reads getAllSchoolForms() (schoolRoles.js) —
// triggers the (cached, de-duped) load on mount and re-renders once real data arrives
// or changes, so the school Form Picker doesn't stay stuck showing just the 3 built-ins.
export function useCustomFormFamilies() {
  const [, setTick] = useState(0);
  useEffect(() => {
    loadCustomFormFamilies().catch(() => {});
    return onCustomFormFamiliesChanged(() => setTick(t => t + 1));
  }, []);
}

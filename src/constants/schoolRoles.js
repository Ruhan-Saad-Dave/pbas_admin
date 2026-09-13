// Fixed catalog of reviewer steps a school's approval chain can be built from.
// The admin composes an ORDERED chain per school by adding/removing/reordering
// these — VC is always the final, locked step (every appraisal ends at the VC).
//
// 'dean' auto-resolves at runtime to "Dean of Engineering" / "Dean of Non-Engineering"
// based on the school's track — there is one Dean per track, not per school.

import { I } from '../components/icons';
import { getCachedCustomFormFamilies } from '../utils/backendFormFamilies';

export const SCHOOL_CHAIN_CATALOG = [
  { key: 'hod',      label: 'HOD',      icon: I.users,  color: '#a78bfa', locked: false, requires: 'has_hod' },
  { key: 'director', label: 'Director', icon: I.key,    color: '#fbbf24', locked: false, requires: 'has_director' },
  { key: 'dean',     label: 'Dean',     icon: I.star,   color: '#34d399', locked: false, requires: null },
  { key: 'center_head', label: 'Center Head', icon: I.layers, color: '#fb923c', locked: false, requiresTrack: 'cisr' },
  { key: 'vc',       label: 'VC',       icon: I.shield, color: '#f472b6', locked: true,  requires: null },
];

export const SCHOOL_CHAIN_MAP = Object.fromEntries(SCHOOL_CHAIN_CATALOG.map(s => [s.key, s]));

export function deanLabelForTrack(track) {
  if (track === 'cisr') return 'Center Head';
  return track === 'engineering' ? 'Dean (Engineering)' : 'Dean (Non-Engineering)';
}

// Sensible starting chain derived from the two toggles — admin can still
// reorder or remove any non-locked step afterwards.
export function defaultChainFor(hasHod, hasDirector, track = 'engineering') {
  if (track === 'cisr') return ['center_head', 'vc'];
  const chain = [];
  if (hasHod) chain.push('hod');
  if (hasDirector) chain.push('director');
  chain.push('dean');
  chain.push('vc');
  return chain;
}

export const SCHOOL_TRACKS = [
  { value: 'engineering',     label: 'Engineering',     icon: I.bldg,   color: '#3b82f6', desc: 'Routes to the Dean of Engineering' },
  { value: 'non_engineering', label: 'Non-Engineering', icon: I.school, color: '#34d399', desc: 'Routes to the Dean of Non-Engineering' },
  { value: 'cisr',            label: 'CISR / Center',   icon: I.layers, color: '#fb923c', desc: 'Routes through Center Head to VC' },
];

// Appraisal forms a school can be assigned. This list is expected to grow — treat
// it as the seed of a future forms registry, not a hardcoded final set.
export const SCHOOL_FORMS = [
  {
    key: 'standard',
    defaultForm: 'standard',
    formVariant: 'standard',
    formType: 'FORM_A',
    aliases: ['standard', 'FORM_A'],
    label: 'Standard Appraisal',
    icon: I.doc,
    color: '#3b82f6',
    desc: 'The default PBAS-style appraisal form used across most schools.',
  },
  {
    key: 'mediaCommunication',
    defaultForm: 'creative',
    formVariant: 'mediaCommunication',
    formType: 'FORM_B',
    aliases: ['mediaCommunication', 'FORM_B'],
    label: 'Creative Appraisal - Media Communication',
    icon: I.chat,
    color: '#22d3ee',
    desc: 'Creative appraisal variant for media and communication schools.',
  },
  {
    key: 'designArts',
    defaultForm: 'creative',
    formVariant: 'designArts',
    formType: 'FORM_C',
    aliases: ['designArts', 'FORM_C', 'creative'],
    label: 'Creative Appraisal - Design Arts',
    icon: I.idea,
    color: '#f472b6',
    desc: 'Creative appraisal variant for design and applied arts schools.',
  },
];

// Built-in forms plus any admin-published, backend-active custom form families
// (src/pages/forms/DynamicFormPage.jsx → the real /admin/form-schema API, see
// src/utils/backendFormFamilies.js — NOT the old browser-only dynamicFormRegistry.js
// prototype, which the backend has no way to validate an assignment against).
// Call useCustomFormFamilies() (backendFormFamilies.js) in any component that
// needs this list to be live/reactive — this function itself just reads whatever
// is currently cached.
export function getAllSchoolForms() {
  const custom = getCachedCustomFormFamilies().map(f => ({
    key: f.key,
    defaultForm: f.defaultForm,
    formVariant: f.formVariant,
    formType: f.formType,
    aliases: f.aliases,
    label: f.label,
    icon: I[f.iconName] || I.doc,
    color: f.color,
    desc: f.desc,
    custom: true,
  }));
  return [...SCHOOL_FORMS, ...custom];
}

export function selectedSchoolFormKey(school = {}) {
  const defaultForm = school.defaultForm ?? school.default_form ?? 'standard';
  const formVariant = school.formVariant ?? school.form_variant ?? (defaultForm === 'creative' ? 'designArts' : 'standard');
  const formType = school.formType ?? school.form_type;
  const matched = getAllSchoolForms().find(f =>
    f.defaultForm === defaultForm && f.formVariant === formVariant
    || f.aliases?.includes(formVariant)
    || f.aliases?.includes(formType)
    || f.aliases?.includes(defaultForm)
  );
  return matched?.key ?? 'standard';
}

export function schoolFormPayload(key) {
  const forms = getAllSchoolForms();
  const form = forms.find(f => f.key === key) ?? forms[0];
  return {
    default_form: form.defaultForm,
    defaultForm: form.defaultForm,
    form_variant: form.formVariant,
    formVariant: form.formVariant,
    form_type: form.formType,
    formType: form.formType,
  };
}

export function schoolFormLabel(school = {}) {
  const key = selectedSchoolFormKey(school);
  const forms = getAllSchoolForms();
  return forms.find(f => f.key === key)?.label ?? forms[0].label;
}

const SCHOOL_FORM_CACHE_KEY = 'pbas_school_form_variants';

export function cacheSchoolFormSelection(code, key) {
  if (!code || typeof localStorage === 'undefined') return;
  try {
    const raw = localStorage.getItem(SCHOOL_FORM_CACHE_KEY);
    const cache = raw ? JSON.parse(raw) : {};
    cache[code] = key;
    localStorage.setItem(SCHOOL_FORM_CACHE_KEY, JSON.stringify(cache));
  } catch {}
}

export function hydrateSchoolFormSelection(school = {}) {
  const hasVariant = Boolean(school.formVariant ?? school.form_variant);
  if (hasVariant || !school.code || typeof localStorage === 'undefined') return school;
  try {
    const raw = localStorage.getItem(SCHOOL_FORM_CACHE_KEY);
    const cache = raw ? JSON.parse(raw) : {};
    const cachedKey = cache[school.code];
    if (!cachedKey) return school;
    return { ...school, ...schoolFormPayload(cachedKey) };
  } catch {
    return school;
  }
}

// ── Auto-suggest a short code from a full school name ──────────────────────────
// e.g. "School of Bio-Engineering & Bio Science" -> "SoBES". Purely a starting
// point — the admin can always type over it; auto-fill stops as soon as they do.
const CODE_STOPWORDS = new Set(['school', 'of', 'the', 'and', 'for', 'in', 'a', 'an']);

export function suggestSchoolCode(fullName) {
  if (!fullName?.trim()) return '';
  const words = fullName
    .replace(/&/g, ' ')
    .split(/[\s,/-]+/)
    .map(w => w.replace(/[^a-zA-Z]/g, ''))
    .filter(Boolean);
  if (!words.length) return '';

  const lower = words.map(w => w.toLowerCase());
  const isSchoolOf = lower[0] === 'school' && lower[1] === 'of';
  const rest = (isSchoolOf ? words.slice(2) : words).filter(w => !CODE_STOPWORDS.has(w.toLowerCase()));
  const source = rest.length ? rest : words.filter(w => !CODE_STOPWORDS.has(w.toLowerCase()));
  const initials = (source.length ? source : words).map(w => w[0].toUpperCase()).join('');

  return isSchoolOf ? `So${initials}` : initials;
}

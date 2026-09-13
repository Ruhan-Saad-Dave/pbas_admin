// Local (browser-only) registry for admin-designed appraisal forms.
//
// There is no backend endpoint to persist a custom field schema, and the
// faculty-facing appraisal renderer only knows the built-in FORM_A/B/C types
// (see src/constants/schoolRoles.js). So this is a prototyping tool: forms
// built and "published" here become selectable in Add/Edit School's Form
// step, but selecting one does NOT change what faculty actually see when
// filling out their appraisal — that needs backend work once a design here
// is ready to hand off. See Docs/form_builder_backend_changes.md.
//
// On first-ever load this seeds two forms — "Standard Appraisal Form" and
// "Creative School Appraisal Form" — built from the REAL current PBAS section
// structure (src/data/pbasFormSeed.js), so the tool opens showing the actual
// form instead of a blank slate. Fields/sections that came from that seed are
// flagged isCustom:false / isCore:true — they can be hidden but not deleted,
// matching the real form's "core field" semantics; anything the admin adds
// afterwards is isCustom:true / isCore:false and can be deleted outright.

import { PBAS_FORM_SEED } from '../data/pbasFormSeed';

const STORAGE_KEY = 'pbas_dynamic_forms';
const CHANGE_EVENT = 'dynamic-forms-changed';

export const FIELD_TYPES = [
  { value: 'text',            label: 'Short Text' },
  { value: 'textarea',        label: 'Long Text' },
  { value: 'number',          label: 'Number (Decimal)' },
  { value: 'integer',         label: 'Number (Whole)' },
  { value: 'date',            label: 'Date' },
  { value: 'dropdown',        label: 'Dropdown' },
  { value: 'conditionalText', label: 'Dropdown + "Other" text' },
  { value: 'checkbox',        label: 'Checkbox' },
  { value: 'computed',        label: 'Read-only / Computed' },
  { value: 'file',            label: 'Document Upload' },
  { value: 'table',           label: 'Table' },
];

// Narrower type set for table columns — a table cell doesn't need its own
// nested dropdown-with-other or sub-table.
export const COLUMN_TYPES = [
  { value: 'textarea', label: 'Long Text' },
  { value: 'dropdown', label: 'Dropdown' },
  { value: 'conditionalText', label: 'Dropdown + "Other" text' },
  { value: 'text',     label: 'Text' },
  { value: 'number',   label: 'Number (Decimal)' },
  { value: 'integer',  label: 'Number (Whole)' },
  { value: 'date',     label: 'Date' },
  { value: 'checkbox', label: 'Checkbox' },
  { value: 'computed', label: 'Read-only' },
  { value: 'file',     label: 'Document' },
];

export const FORM_COLORS = ['#3b82f6', '#a78bfa', '#34d399', '#fbbf24', '#fb923c', '#f472b6', '#22d3ee', '#818cf8'];

export const FORM_ICON_NAMES = ['doc', 'edit', 'chat', 'idea', 'star', 'layers', 'workflow', 'badge', 'list', 'gear'];

// ── Masking / filtering helpers, shared by the builder's live preview ───────
// (Mirrors the faculty-facing form's TI component behavior: no native
// <input type="number"|"date">, just text + JS-side formatting/validation.)
export function maskDateDDMMYYYY(raw) {
  const digits = (raw || '').replace(/\D/g, '').slice(0, 8);
  if (digits.length > 4) return `${digits.slice(0, 2)}/${digits.slice(2, 4)}/${digits.slice(4)}`;
  if (digits.length > 2) return `${digits.slice(0, 2)}/${digits.slice(2)}`;
  return digits;
}

export function isValidDDMMYYYY(str) {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(str || '');
  if (!m) return false;
  const [, dd, mm, yyyy] = m;
  const d = new Date(Number(yyyy), Number(mm) - 1, Number(dd));
  return d.getFullYear() === Number(yyyy) && d.getMonth() === Number(mm) - 1 && d.getDate() === Number(dd);
}

export function filterNumeric(raw, { integer = false } = {}) {
  if (integer) return (raw || '').replace(/[^\d]/g, '');
  let v = (raw || '').replace(/[^\d.]/g, '');
  const firstDot = v.indexOf('.');
  if (firstDot !== -1) v = v.slice(0, firstDot + 1) + v.slice(firstDot + 1).replace(/\./g, '');
  return v;
}

function blankSection() {
  return {
    id: `s_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`,
    title: '',
    part: '',
    isCore: false,
    active: true,
    fields: [],
  };
}

export function newSection(index = 0, part = '') {
  return { ...blankSection(), title: `Section ${index + 1}`, part };
}

export function blankColumn(type = 'text', index = 0) {
  return { name: `Column ${index + 1}`, type, maxMarks: null, options: ['Option 1', 'Other'], triggerValue: 'Other', extraLabel: 'Please specify' };
}

// Every new table gets this as its permanent last column — locked (can't be
// removed or reordered away from last) and its Max value is required before
// the table can be saved. See requireSelfScoreMax() in DynamicFormPage.jsx.
export function selfScoreColumn() {
  return { name: 'Faculty Score', placeholder: 'Self Score', type: 'integer', maxMarks: null, fixedMax: false, options: [], triggerValue: '', extraLabel: '', locked: true };
}

export function blankField(type = 'text') {
  const hasOptions = type === 'dropdown' || type === 'conditionalText';
  return {
    id: `f_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`,
    label: '',
    type,
    required: false,
    options: hasOptions ? ['Option 1', 'Other'] : [],
    triggerValue: type === 'conditionalText' ? 'Other' : '',
    extraLabel: type === 'conditionalText' ? 'Please specify' : '',
    columns: type === 'table' ? [blankColumn('text', 0), selfScoreColumn()] : [],
    autoSerial: type === 'table' ? true : undefined,
    requireCompleteRows: type === 'table' ? false : undefined,
    maxMarks: type === 'table' ? null : undefined,
    guideline: type === 'table' ? '' : undefined,
    isCustom: true,
    active: true,
  };
}

export function blankDraft() {
  return {
    key: '',
    label: '',
    desc: '',
    color: FORM_COLORS[0],
    iconName: FORM_ICON_NAMES[0],
    parts: ['Part A'],
    partGuidelines: {},
    sections: [],
    published: false,
    createdAt: null,
    updatedAt: null,
  };
}

// ── Seeding from the real PBAS form structure ────────────────────────────────
const PBAS_FAMILY_META = {
  standard: { label: 'Standard Appraisal Form', color: '#3b82f6', iconName: 'doc' },
  creative: { label: 'Creative School Appraisal Form', color: '#f472b6', iconName: 'idea' },
};

function pbasFieldToColumn(f) {
  const known = COLUMN_TYPES.some(t => t.value === f.type);
  const type = f.type === 'yesNo' ? 'checkbox' : known ? f.type : 'text';
  return { name: f.label, type, maxMarks: f.rowMax ?? null };
}

function pbasFieldToField(f) {
  const type = f.type === 'select' || f.type === 'yesNo' ? 'dropdown' : f.type;
  const isDropdownLike = type === 'dropdown' || type === 'conditionalText';
  const options = f.type === 'yesNo' ? ['Yes', 'No'] : (f.options || []);
  return {
    id: `f_${f.key}_${Math.random().toString(36).slice(2, 7)}`,
    label: f.label,
    type,
    required: !!f.required,
    options: isDropdownLike ? options : [],
    triggerValue: f.triggerValue || (type === 'conditionalText' ? (options[options.length - 1] || 'Other') : ''),
    extraLabel: f.extraLabel || (type === 'conditionalText' ? 'Please specify' : ''),
    columns: [],
    autoSerial: undefined,
    isCustom: false,
    active: f.active !== false,
  };
}

function pbasSectionToSection(section) {
  const base = { id: `s_${section.code}`, title: section.title, part: `Part ${section.part}`, isCore: true, active: section.active !== false };
  if (section.repeatable) {
    return {
      ...base,
      fields: [{
        id: `f_${section.code}_table`,
        label: section.title,
        type: 'table',
        required: false,
        options: [],
        triggerValue: '',
        extraLabel: '',
        columns: section.fieldSchema.map(pbasFieldToColumn),
        autoSerial: true,
        maxMarks: section.maxMarks ?? null,
        isCustom: false,
        active: true,
      }],
    };
  }
  return { ...base, fields: section.fieldSchema.map(pbasFieldToField) };
}

function buildPbasSeedForms() {
  const families = [...new Set(PBAS_FORM_SEED.map(s => s.formFamily))];
  const now = new Date().toISOString();
  return families.map(fam => {
    const meta = PBAS_FAMILY_META[fam] || { label: fam, color: FORM_COLORS[0], iconName: 'doc' };
    const familySections = PBAS_FORM_SEED.filter(s => s.formFamily === fam);
    const parts = [...new Set(familySections.map(s => s.part))].sort().map(p => `Part ${p}`);
    return {
      key: `pbas-${fam}`,
      label: meta.label,
      desc: `Seeded from the real current ${fam === 'standard' ? 'Standard' : 'Creative School'} PBAS appraisal form structure.`,
      color: meta.color,
      iconName: meta.iconName,
      parts,
      sections: familySections.map(pbasSectionToSection),
      published: false,
      createdAt: now,
      updatedAt: now,
    };
  });
}

// ── Normalization — keeps older saved forms loading cleanly as the shape grows ─
function normalizeField(field) {
  let columns = (field.columns || []).map(col => ({ maxMarks: null, ...col }));
  // Tables created before the locked Self Score column existed have none — leave
  // them alone (don't retroactively inject one into legacy/seeded data). Tables
  // that do have one keep it pinned as the true last column no matter what order
  // it was saved in.
  const lockedIdx = columns.findIndex(c => c.locked);
  if (lockedIdx !== -1 && lockedIdx !== columns.length - 1) {
    const [locked] = columns.splice(lockedIdx, 1);
    columns = [...columns, locked];
  }
  return {
    ...field,
    isCustom: field.isCustom ?? true,
    active: field.active ?? true,
    maxMarks: field.type === 'table' ? (field.maxMarks ?? null) : field.maxMarks,
    guideline: field.type === 'table' ? (field.guideline ?? '') : field.guideline,
    columns,
  };
}

// A locked Faculty Score column's "Total Marks per Row" is only required input
// when its "Fixed" checkbox is on (fixedMax:true) — otherwise it silently
// follows the table's own Total Marks value (see resolveSelfScoreMax below),
// so an unset value there is never a save-blocking problem.
export function resolveSelfScoreMax(field, col) {
  if (!col) return null;
  if (!col.locked) return col.maxMarks ?? null;
  return col.fixedMax ? (col.maxMarks ?? null) : (field.maxMarks ?? null);
}

// True once every table field's locked Faculty Score column (if it has one and
// is set to Fixed) has a Max value set — call before saving/publishing so
// half-set tables can't go live.
export function findMissingSelfScoreMax(sections) {
  const problems = [];
  for (const section of sections) {
    for (const field of section.fields) {
      if (field.type !== 'table') continue;
      const scoreCol = field.columns.find(c => c.locked);
      if (scoreCol?.fixedMax && (scoreCol.maxMarks === null || scoreCol.maxMarks === undefined)) {
        problems.push({ sectionTitle: section.title, fieldLabel: field.label });
      }
    }
  }
  return problems;
}

function normalizeSection(section) {
  return {
    ...section,
    part: section.part ?? '',
    isCore: section.isCore ?? false,
    active: section.active ?? true,
    fields: (section.fields || []).map(normalizeField),
  };
}

// Older saved forms (before sections/parts existed) had a flat `fields` array —
// wrap it into a single section so they still load and render.
function normalizeForm(form) {
  let next = form;
  if (!Array.isArray(next.sections)) {
    if (Array.isArray(next.fields)) {
      const { fields, ...rest } = next;
      next = { ...rest, sections: fields.length ? [{ ...blankSection(), title: 'Section 1', fields }] : [] };
    } else {
      next = { ...next, sections: [] };
    }
  }
  const sections = next.sections.map(normalizeSection);
  const parts = Array.isArray(next.parts) && next.parts.length
    ? next.parts
    : [...new Set(sections.map(s => s.part).filter(Boolean))];
  return { ...next, parts: parts.length ? parts : ['Part A'], sections };
}

function readAll() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw === null) {
      const seeded = buildPbasSeedForms();
      writeAll(seeded);
      return seeded;
    }
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.map(normalizeForm) : [];
  } catch {
    return [];
  }
}

function writeAll(forms) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(forms));
  } catch {}
  try {
    window.dispatchEvent(new CustomEvent(CHANGE_EVENT));
  } catch {}
}

export function onDynamicFormsChanged(cb) {
  window.addEventListener(CHANGE_EVENT, cb);
  window.addEventListener('storage', cb);
  return () => {
    window.removeEventListener(CHANGE_EVENT, cb);
    window.removeEventListener('storage', cb);
  };
}

export function slugify(label) {
  return (label || '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '') || 'form';
}

function uniqueKey(label, forms, ignoreKey) {
  const base = slugify(label);
  let key = base;
  let n = 2;
  while (forms.some(f => f.key === key && f.key !== ignoreKey)) {
    key = `${base}-${n}`;
    n += 1;
  }
  return key;
}

export function getDynamicForms() {
  return readAll();
}

export function getPublishedDynamicForms() {
  return readAll().filter(f => f.published);
}

export function getDynamicForm(key) {
  return readAll().find(f => f.key === key) || null;
}

// Saves (creates or updates) a form as a draft — does not change published state.
export function saveDynamicForm(form) {
  const forms = readAll();
  const now = new Date().toISOString();
  const existingIdx = form.key ? forms.findIndex(f => f.key === form.key) : -1;

  const key = existingIdx >= 0 ? form.key : uniqueKey(form.label, forms);
  const saved = {
    ...form,
    key,
    createdAt: existingIdx >= 0 ? forms[existingIdx].createdAt : now,
    updatedAt: now,
  };

  if (existingIdx >= 0) {
    forms[existingIdx] = saved;
  } else {
    forms.push(saved);
  }
  writeAll(forms);
  return saved;
}

export function setPublished(key, published) {
  const forms = readAll();
  const idx = forms.findIndex(f => f.key === key);
  if (idx < 0) return null;
  forms[idx] = { ...forms[idx], published, updatedAt: new Date().toISOString() };
  writeAll(forms);
  return forms[idx];
}

export function deleteDynamicForm(key) {
  const forms = readAll().filter(f => f.key !== key);
  writeAll(forms);
}

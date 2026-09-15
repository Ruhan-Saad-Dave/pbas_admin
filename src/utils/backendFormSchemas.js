const canonicalType = type => type === 'conditionaltext' ? 'conditionalText' : type;

// Deterministic stringify (keys sorted) so two objects built via different
// spread/property orders still compare equal — used to detect whether a
// section actually changed before re-sending it to the backend.
function stableStringify(value) {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map(k => `${JSON.stringify(k)}:${stableStringify(value[k])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

export function readField(field) {
  if (typeof field === 'string') return { id: field, key: field, label: field, type: 'text', active: true, isCustom: false, columns: [], options: [] };
  return {
    ...field, id: field.id || field.key, type: canonicalType(field.type),
    active: field.active !== false, isCustom: field.isCustom ?? field.is_custom ?? true,
    options: field.options || [], columns: (field.columns || []).map(c => ({
      ...c, type: canonicalType(c.type), placeholder: typeof c.placeholder === 'string' ? c.placeholder : '',
      maxMarks: c.maxMarks ?? c.max_marks ?? null,
      triggerValue: c.triggerValue ?? c.trigger_value, extraLabel: c.extraLabel ?? c.extra_label,
    })),
    requireCompleteRows: field.requireCompleteRows ?? field.require_complete_rows ?? false,
    autoSerial: field.autoSerial ?? field.auto_serial ?? true,
    maxMarks: field.maxMarks ?? field.max_marks ?? null,
    triggerValue: field.triggerValue ?? field.trigger_value,
    extraLabel: field.extraLabel ?? field.extra_label,
    guideline: field.guideline ?? '',
  };
}

export function formsFromSchemas(rows, metadata = {}) {
  if (!Array.isArray(rows)) throw new Error('Invalid form-schema response: expected a list.');
  const grouped = new Map();
  for (const row of rows) {
    if (!row.code || !row.form_family || !Array.isArray(row.fields)) throw new Error('Invalid schema record received from backend.');
    const group = grouped.get(row.form_family) || [];
    group.push(row);
    grouped.set(row.form_family, group);
  }
  return [...grouped].map(([family, records]) => {
    records.sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
    const meta = metadata[family] || {};
    // part_guideline is a real backend column now (written onto every row that
    // shares a part) — prefer it over the old browser-only cache; only fall
    // back to the local cache for a part the backend has no value for yet.
    const backendPartGuidelines = {};
    const registrarParts = {};
    const reviewerOnlyParts = {};
    let backendFamilyLabel = null;
    for (const r of records) {
      const g = r.part_guideline ?? r.partGuideline;
      if (r.part && g) backendPartGuidelines[r.part] = g;
      if (r.part && (r.registrar_part ?? r.registrarPart)) registrarParts[r.part] = true;
      if (r.part && (r.reviewer_only_part ?? r.reviewerOnlyPart)) reviewerOnlyParts[r.part] = true;
      if (!backendFamilyLabel) backendFamilyLabel = r.family_label ?? r.familyLabel ?? null;
    }
    return {
      key: `backend:${family}`, backendFamily: family, backendManaged: true,
      // family_label is a real backend column now — prefer it over the old
      // browser-only cache, same as part_guideline.
      label: backendFamilyLabel || meta.label || family, desc: meta.desc || '', color: meta.color || '#3b82f6', iconName: meta.iconName || 'doc',
      parts: [...new Set(records.map(r => r.part))],
      partGuidelines: { ...(meta.partGuidelines || {}), ...backendPartGuidelines },
      // Backend-owned, unlike partGuidelines — no local-cache fallback merge here,
      // since registrarParts only ever records `true` entries (never explicit
      // `false`), so merging a stale local `true` in could resurrect a flag the
      // admin already unchecked and saved as false.
      registrarParts,
      reviewerOnlyParts,
      tableOrder: [...new Set(records.flatMap(r => r.tableOrder || r.table_order || []))],
      published: records.some(r => r.active), sections: records.map(r => ({
        id: r.code, backendCode: r.code, sectionKey: r.section_key, storageTable: r.storage_table,
        title: r.title, part: r.part, active: r.active !== false, isCore: !!r.storage_table,
        maxMarks: r.max_marks ?? 0, fields: r.fields.map(readField),
      })),
    };
  });
}

// Shared by save() and diff() — builds, for every table that would be sent,
// what its next payload would look like and whether that differs from what
// the backend currently has stored for it (`current`, freshly fetched — never
// a stale local snapshot, so this can't miss a change someone else made).
function buildPlan(form, existing, activate) {
  if (!form.backendFamily) throw new Error('Missing stable backend form identifier.');
  for (const part of form.parts) {
    if (!form.sections.some(s => s.part === part && s.fields.length)) throw new Error(`Create a table in "${part}" before saving. Empty parts are not supported by this backend.`);
  }
  const owned = existing.filter(r => r.form_family === form.backendFamily);
  const codes = new Set(existing.map(r => r.code));
  const keep = new Set();
  const sections = [...form.sections].sort((a, b) => form.parts.indexOf(a.part) - form.parts.indexOf(b.part));
  const entries = [];
  let completed = 0;
  for (const section of sections) {
    if (!section.fields.length && !section.isCore) continue;
    const code = section.backendCode || `${form.backendFamily}_${section.id}`;
    const current = owned.find(r => r.code === code);
    if (!current && codes.has(code)) throw new Error('Schema code belongs to another form.');
    keep.add(code);
    const orderedFields = [...section.fields].sort((a, b) => {
      const order = form.tableOrder || [];
      const rank = id => order.includes(id) ? order.indexOf(id) : order.length;
      return rank(a.id) - rank(b.id);
    });
    const fields = orderedFields.map((f, fieldIndex) => ({
      ...f, key: f.key || f.id,
      // Trim stray leading/trailing spaces from typing — otherwise an invisible
      // space difference makes this look "changed" on every save/diff forever.
      label: typeof f.label === 'string' ? f.label.trim() : f.label,
      // Explicit numeric position, not just array position — so any consumer
      // (the faculty renderer included) can sort fields correctly even if a
      // JSON round-trip somewhere doesn't preserve array order. Recomputed from
      // the draft's actual current order on every save, so reordering in the
      // builder always keeps this in sync — no separate step needed.
      order: fieldIndex,
      // A locked Faculty Score column that isn't individually "Fixed" has no
      // maxMarks of its own — it follows the table's Total Marks (f.maxMarks).
      // Resolve that here so the backend always receives a real number.
      columns: (f.columns || []).map((c, colIndex) => ({
        ...c, placeholder: c.placeholder ?? '',
        name: typeof c.name === 'string' ? c.name.trim() : c.name,
        order: colIndex,
        maxMarks: !['number', 'integer'].includes(c.type) ? null
          : c.locked && !c.fixedMax ? (f.maxMarks ?? null)
          : (c.maxMarks ?? null),
      })),
    }));
    // Plain "Save" now persists whatever the draft's own active state is — new
    // sections default active:true (blankSection()/newSection()), so a table is
    // visible to faculty as soon as it's saved, no separate Activate click needed.
    // Explicit Activate/Deactivate still bulk-set the whole family, but an
    // individually-retired section (active:false in the draft) stays retired
    // even during a bulk Activate, so restoring one still requires the
    // "Restore retired items" checkbox first.
    const active = activate === undefined ? section.active !== false : activate && section.active !== false;
    // Written onto every table that shares this part — denormalized (same
    // value repeated across rows) since a Part isn't its own backend row.
    const partGuideline = form.partGuidelines?.[section.part] || null;
    const registrarPart = !!form.registrarParts?.[section.part];
    const reviewerOnlyPart = !!form.reviewerOnlyParts?.[section.part];
    // Written onto every section in the family — a family isn't its own
    // backend row either, same denormalized pattern as partGuideline.
    const familyLabel = form.label?.trim() || null;
    const payload = {
      code, form_family: form.backendFamily, part: section.part,
      section_key: section.sectionKey || code,
      title: (fields.length === 1 ? fields[0].label || section.title : section.title || '').trim(),
      max_marks: section.maxMarks ?? 0, active, order: completed,
      tableOrder: form.tableOrder || [], fields, part_guideline: partGuideline,
      registrar_part: registrarPart, reviewer_only_part: reviewerOnlyPart,
      family_label: familyLabel,
    };
    let kind = 'create';
    if (current) {
      const unchanged =
        current.title === payload.title &&
        current.part === payload.part &&
        (current.max_marks ?? 0) === payload.max_marks &&
        (current.active !== false) === payload.active &&
        (current.order ?? 0) === payload.order &&
        (current.part_guideline ?? current.partGuideline ?? null) === payload.part_guideline &&
        !!(current.registrar_part ?? current.registrarPart) === payload.registrar_part &&
        !!(current.reviewer_only_part ?? current.reviewerOnlyPart) === payload.reviewer_only_part &&
        (current.family_label ?? current.familyLabel ?? null) === payload.family_label &&
        stableStringify(current.tableOrder || current.table_order || []) === stableStringify(payload.tableOrder) &&
        stableStringify(current.fields) === stableStringify(fields);
      kind = unchanged ? 'unchanged' : 'update';
    }
    entries.push({ code, part: section.part, current, payload, fields, kind });
    completed++;
  }
  const deletions = owned.filter(row => !keep.has(row.code));
  return { entries, deletions };
}

export function createSchemaStore(api) {
  async function load(metadata) { return formsFromSchemas(await api.list(), metadata); }
  // Read-only preview of exactly what a Save would do right now, without
  // sending anything — a GitHub-style diff of the family against its current
  // backend state: which tables would be created / updated (and what
  // specifically changed inside them) / deleted / left untouched.
  async function diff(form, { activate } = {}) {
    const existing = await api.list();
    if (!Array.isArray(existing)) throw new Error('Could not verify existing schemas.');
    const { entries, deletions } = buildPlan(form, existing, activate);
    const describe = entry => {
      const changes = [];
      if (entry.kind === 'update') {
        const { current, payload, fields } = entry;
        if (current.title !== payload.title) changes.push(`Title: "${current.title}" → "${payload.title}"`);
        if (current.part !== payload.part) changes.push(`Moved: "${current.part}" → "${payload.part}"`);
        if ((current.max_marks ?? 0) !== payload.max_marks) changes.push(`Total Marks: ${current.max_marks ?? 0} → ${payload.max_marks}`);
        if ((current.active !== false) !== payload.active) changes.push(payload.active ? 'Reactivated' : 'Retired / deactivated');
        if ((current.order ?? 0) !== payload.order) changes.push('Reordered');
        if ((current.part_guideline ?? current.partGuideline ?? null) !== payload.part_guideline) changes.push('Part guideline changed');
        if (!!(current.registrar_part ?? current.registrarPart) !== payload.registrar_part) changes.push(payload.registrar_part ? 'Marked Registrar-only' : 'Unmarked Registrar-only');
        if (!!(current.reviewer_only_part ?? current.reviewerOnlyPart) !== payload.reviewer_only_part) changes.push(payload.reviewer_only_part ? 'Marked reviewer-only (faculty does not fill)' : 'Unmarked reviewer-only');
        if ((current.family_label ?? current.familyLabel ?? null) !== payload.family_label) changes.push(`Form name: "${current.family_label ?? current.familyLabel ?? ''}" → "${payload.family_label ?? ''}"`);
        if (stableStringify(current.tableOrder || current.table_order || []) !== stableStringify(payload.tableOrder)) changes.push('Column/table sequence changed');
        const oldFields = new Map((current.fields || []).map(f => [f.id || f.key, f]));
        const newFields = new Map(fields.map(f => [f.id || f.key, f]));
        for (const [id, nf] of newFields) {
          const of = oldFields.get(id);
          if (!of) { changes.push(`Added field "${nf.label || id}"`); continue; }
          if ((of.guideline || '') !== (nf.guideline || '')) changes.push(`Guideline changed on "${nf.label || id}"`);
          const oldCols = new Map((of.columns || []).map((c, i) => [c.name ? `n:${c.name}` : `i:${i}`, c]));
          const newCols = new Map((nf.columns || []).map((c, i) => [c.name ? `n:${c.name}` : `i:${i}`, c]));
          for (const [key, nc] of newCols) {
            const oc = oldCols.get(key);
            if (!oc) { changes.push(`Added column "${nc.name}" in "${nf.label || id}"`); continue; }
            if (oc.type !== nc.type) changes.push(`Column "${nc.name}" type: ${oc.type} → ${nc.type}`);
            if ((oc.maxMarks ?? null) !== (nc.maxMarks ?? null)) changes.push(`Column "${nc.name}" max marks: ${oc.maxMarks ?? '—'} → ${nc.maxMarks ?? '—'}`);
          }
          for (const key of oldCols.keys()) if (!newCols.has(key)) changes.push(`Removed column "${oldCols.get(key).name}" in "${nf.label || id}"`);
        }
        for (const id of oldFields.keys()) if (!newFields.has(id)) changes.push(`Removed field "${oldFields.get(id).label || id}"`);
      }
      return { code: entry.code, part: entry.part, title: entry.payload.title, kind: entry.kind, changes };
    };
    return {
      created: entries.filter(e => e.kind === 'create').map(describe),
      updated: entries.filter(e => e.kind === 'update').map(describe),
      unchanged: entries.filter(e => e.kind === 'unchanged').map(describe),
      deleted: deletions.map(r => ({ code: r.code, part: r.part, title: r.title })),
    };
  }
  async function save(form, { activate } = {}) {
    const existing = await api.list();
    if (!Array.isArray(existing)) throw new Error('Could not verify existing schemas.');
    const { entries, deletions } = buildPlan(form, existing, activate);
    try {
      for (const entry of entries) {
        if (entry.kind === 'unchanged') continue;
        if (entry.kind === 'update') {
          await api.updateFields(entry.code, { fields: entry.fields, tableOrder: entry.payload.tableOrder });
          await api.update(entry.code, { title: entry.payload.title, part: entry.payload.part, max_marks: entry.payload.max_marks, active: entry.payload.active, order: entry.payload.order, tableOrder: entry.payload.tableOrder, part_guideline: entry.payload.part_guideline, registrar_part: entry.payload.registrar_part, reviewer_only_part: entry.payload.reviewer_only_part, family_label: entry.payload.family_label });
        } else {
          await api.create(entry.payload);
        }
      }
      for (const row of deletions) await api.remove(row.code);
    } catch (error) {
      throw new Error(`Schema save did not finish: ${error.message}. Some requests may already have succeeded; your draft is retained. Retry to reconcile with the server.`);
    }
    return load({ [form.backendFamily]: form });
  }
  async function remove(form) {
    const rows = await api.list();
    if (!Array.isArray(rows)) throw new Error('Could not verify schemas before deletion.');
    const owned = rows.filter(r => r.form_family === form.backendFamily);
    for (const row of owned) await api.remove(row.code);
    const remaining = await api.list();
    if (!Array.isArray(remaining)) throw new Error('Could not verify the deletion result. Reload schemas.');
    const retained = remaining.filter(r => r.form_family === form.backendFamily);
    if (retained.some(r => r.active || !r.storage_table)) {
      throw new Error('Some schema records remain active or were not deleted. Reload schemas before retrying.');
    }
    return {
      deleted: owned.filter(r => !retained.some(s => s.code === r.code)).length,
      retired: retained.length,
    };
  }
  return { load, save, remove, diff };
}

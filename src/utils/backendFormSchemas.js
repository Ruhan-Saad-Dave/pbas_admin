const canonicalType = type => type === 'conditionaltext' ? 'conditionalText' : type;

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
    return {
      key: `backend:${family}`, backendFamily: family, backendManaged: true,
      label: meta.label || family, desc: meta.desc || '', color: meta.color || '#3b82f6', iconName: meta.iconName || 'doc',
      parts: [...new Set(records.map(r => r.part))],
      partGuidelines: meta.partGuidelines || {},
      tableOrder: [...new Set(records.flatMap(r => r.tableOrder || r.table_order || []))],
      published: records.some(r => r.active), sections: records.map(r => ({
        id: r.code, backendCode: r.code, sectionKey: r.section_key, storageTable: r.storage_table,
        title: r.title, part: r.part, active: r.active !== false, isCore: !!r.storage_table,
        maxMarks: r.max_marks ?? 0, fields: r.fields.map(readField),
      })),
    };
  });
}

export function createSchemaStore(api) {
  async function load(metadata) { return formsFromSchemas(await api.list(), metadata); }
  async function save(form, { activate } = {}) {
    if (!form.backendFamily) throw new Error('Missing stable backend form identifier.');
    for (const part of form.parts) {
      if (!form.sections.some(s => s.part === part && s.fields.length)) throw new Error(`Create a table in "${part}" before saving. Empty parts are not supported by this backend.`);
    }
    const existing = await api.list();
    if (!Array.isArray(existing)) throw new Error('Could not verify existing schemas.');
    const owned = existing.filter(r => r.form_family === form.backendFamily);
    const codes = new Set(existing.map(r => r.code));
    const keep = new Set();
    const sections = [...form.sections].sort((a, b) => form.parts.indexOf(a.part) - form.parts.indexOf(b.part));
    let completed = 0;
    try {
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
        const fields = orderedFields.map(f => ({
          ...f, key: f.key || f.id,
          // A locked Faculty Score column that isn't individually "Fixed" has no
          // maxMarks of its own — it follows the table's Total Marks (f.maxMarks).
          // Resolve that here so the backend always receives a real number.
          columns: (f.columns || []).map(c => ({
            ...c, placeholder: c.placeholder ?? '',
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
        const payload = {
          code, form_family: form.backendFamily, part: section.part,
          section_key: section.sectionKey || code,
          title: fields.length === 1 ? fields[0].label || section.title : section.title,
          max_marks: section.maxMarks ?? 0, active, order: completed,
          tableOrder: form.tableOrder || [], fields,
        };
        if (current) {
          await api.updateFields(code, { fields, tableOrder: payload.tableOrder });
          await api.update(code, { title: payload.title, part: payload.part, max_marks: payload.max_marks, active, order: payload.order, tableOrder: payload.tableOrder });
        } else {
          await api.create(payload);
        }
        completed++;
      }
      for (const row of owned) if (!keep.has(row.code)) await api.remove(row.code);
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
  return { load, save, remove };
}

import { useState, useEffect, useRef } from 'react';
import { C } from '../../constants/colors';
import { I } from '../../components/icons';
import { inp, lbl, pBtn, oBtn, smBtn } from '../../constants/styleTokens';
import PageHead from '../../components/PageHead';
import './DynamicFormPage.css';
import { api } from '../../api/client';
import { createSchemaStore } from '../../utils/backendFormSchemas';
import { readFormMetadata, writeFormMetadata } from '../../utils/backendFormMetadata';
import { notifyCustomFormFamiliesChanged } from '../../utils/backendFormFamilies';

const schemaStore = createSchemaStore(api.formSchemas);

import { incompleteTableRows } from '../../utils/tableRowValidation';
import Badge from '../../components/Badge';
import {
  FIELD_TYPES, COLUMN_TYPES, FORM_COLORS, FORM_ICON_NAMES,
  getDynamicForms, deleteDynamicForm,
  blankDraft, blankField, blankColumn, newSection,
  maskDateDDMMYYYY, isValidDDMMYYYY, filterNumeric,
  findMissingSelfScoreMax, resolveSelfScoreMax,
} from '../../utils/dynamicFormRegistry';

const STEPS = [
  { label: 'Details',  sub: 'Name, description, color & icon',        icon: I.doc },
  { label: 'Tables', sub: 'Tables grouped by part',             icon: I.layers },
  { label: 'Preview',  sub: 'Try filling it in — this is how it will look', icon: I.eye },
  { label: 'Publish',  sub: 'Review and make it available to schools', icon: I.check },
];

const TYPE_ICONS = {
  text: I.edit, textarea: I.doc, number: I.chart, integer: I.list, date: I.time,
  dropdown: I.chevron, conditionalText: I.workflow, checkbox: I.check, computed: I.gear,
  file: I.dl, table: I.layers,
};

function fieldCount(form) {
  return (form.sections || []).reduce((sum, s) => sum + s.fields.length, 0);
}

const tableCount = form => form.sections.reduce((sum, s) => sum + s.fields.filter(f => f.type === 'table').length, 0);

const isNumericColumn = type => type === 'number' || type === 'integer';

function Stepper({ current, onStepClick }) {
  return (
    <ol className="df-steps" aria-label="Form creation progress">
      {STEPS.map((s, i) => {
        const StepIcon = s.icon;
        return (
          <li key={s.label} className={i === current ? 'is-current' : i < current ? 'is-complete' : ''} aria-current={i === current ? 'step' : undefined}>
            <button type="button" className="df-step-btn" onClick={() => onStepClick(i)} title={`Go to ${s.label}`}>
              <span className="df-step-number">{i < current ? <I.check size={15} /> : <StepIcon size={13} />}</span>
              <span>{s.label}</span>
            </button>
          </li>
        );
      })}
    </ol>
  );
}

function FormsList({ forms, activeKey, onSelect, onNew, onDelete }) {
  const [search, setSearch] = useState('');
  const filtered = forms.filter(f => (f.label || 'Untitled Form').toLowerCase().includes(search.toLowerCase()));
  return (
    <aside className="df-library">
      <div className="df-library-heading"><h2>Form library</h2><span>{forms.length}</span></div>
      <button type="button" className="df-new" onClick={onNew}><I.edit size={16} /> New form</button>
      <input className="ifield df-search" aria-label="Search forms" placeholder="Search forms..." value={search} onChange={e => setSearch(e.target.value)} />
      <div className="df-form-list">
        {filtered.map(f => {
          const Icon = I[f.iconName] || I.doc;
          return (
            <div key={f.key} className={`df-library-item ${activeKey === f.key ? 'is-selected' : ''}`}>
              <button type="button" className="df-select-form" onClick={() => onSelect(f)} aria-pressed={activeKey === f.key}>
                <span className="df-form-icon" style={{ color: f.color }}><Icon size={18} /></span>
                <span className="df-form-info">
                  <strong>{f.label || 'Untitled Form'}</strong>
                  <span>{f.parts.length} parts / {tableCount(f)} tables</span>
                  <span className={`df-status ${f.published ? 'is-published' : ''}`}>{f.backendManaged ? (f.published ? 'Active schema' : 'Inactive schema') : 'Local draft'}</span>
                </span>
              </button>
              <button type="button" className="df-icon-button df-delete" title={`${f.backendManaged && f.sections.some(s => s.isCore) ? 'Retire' : 'Delete'} ${f.label || 'form'}`} aria-label={`${f.backendManaged && f.sections.some(s => s.isCore) ? 'Retire' : 'Delete'} ${f.label || 'form'}`} onClick={() => onDelete(f)}><I.trash size={14} /></button>
            </div>
          );
        })}
        {!filtered.length && <div className="df-library-empty">{forms.length ? 'No matching forms' : 'No saved forms'}</div>}
      </div>
    </aside>
  );
}

function DetailsStep({ draft, updateDraft }) {
  return (
    <div className="df-details">
      <div style={{ marginBottom: 14 }}>
        <label htmlFor="df-name" style={lbl}>Form name *</label>
        <input className="ifield" style={inp} id="df-name" placeholder="e.g. Research-Heavy Appraisal" value={draft.label} autoComplete="off" autoFocus onChange={e => updateDraft({ label: e.target.value })} />
      </div>
      <div style={{ marginBottom: 18 }}>
        <label htmlFor="df-description" style={lbl}>Description</label>
        <textarea id="df-description" className="ifield" style={{ ...inp, minHeight: 64, resize: 'vertical' }} placeholder="What this form is for / who should use it" value={draft.desc} onChange={e => updateDraft({ desc: e.target.value })} />
      </div>

      <div className="df-appearance" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
        <div>
          <label style={lbl}>Color</label>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {FORM_COLORS.map(col => (
              <button key={col} type="button" title={`Color ${col}`} aria-label={`Color ${col}`} aria-pressed={draft.color === col} className="act-btn" onClick={() => updateDraft({ color: col })}
                style={{
                  width: 28, height: 28, borderRadius: '50%', cursor: 'pointer',
                  background: col, border: draft.color === col ? '2px solid #fff' : '2px solid transparent',
                  boxShadow: draft.color === col ? `0 0 0 2px ${col}` : 'none',
                }} />
            ))}
          </div>
        </div>
        <div>
          <label style={lbl}>Icon</label>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {FORM_ICON_NAMES.map(name => {
              const Icon = I[name];
              const active = draft.iconName === name;
              return (
                <button key={name} type="button" title={name} aria-label={`Form icon: ${name}`} aria-pressed={active} className="act-btn" onClick={() => updateDraft({ iconName: name })}
                  style={{
                    width: 28, height: 28, borderRadius: 8, cursor: 'pointer',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    background: active ? `${draft.color}22` : 'var(--c-soft-bg)',
                    border: `1px solid ${active ? `${draft.color}45` : 'var(--c-border)'}`,
                    color: active ? draft.color : C.muted,
                  }}>
                  <Icon size={13} />
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Field row editor ─────────────────────────────────────────────────────────
function FieldRow({ field, index, total, onChange, onMove, onDelete }) {
  const set = (k, v) => onChange({ ...field, [k]: v });
  const fileInputRef = useRef(null);
  const TypeIcon = TYPE_ICONS[field.type] || I.edit;

  function setOptionsText(text) {
    set('options', text.split('\n').map(s => s.trim()).filter(Boolean));
  }
  function updateColumn(idx, patch) {
    const cols = [...field.columns];
    cols[idx] = { ...cols[idx], ...patch };
    set('columns', cols);
  }
  function addColumn() {
    // New columns always land before the locked Self Score column, if one exists,
    // so it stays pinned as the last column.
    const lockedIdx = field.columns.findIndex(c => c.locked);
    const insertAt = lockedIdx === -1 ? field.columns.length : lockedIdx;
    const cols = [...field.columns];
    cols.splice(insertAt, 0, blankColumn('text', field.columns.length));
    set('columns', cols);
  }
  function removeColumn(idx, force = false) {
    if (field.columns[idx]?.locked && !force) return;
    set('columns', field.columns.filter((_, i) => i !== idx));
  }
  function removeLockedColumn(idx) {
    if (!window.confirm('Delete the Faculty Score column from this table? It won\'t be re-added automatically — add it back manually if needed.')) return;
    removeColumn(idx, true);
  }
  function moveColumn(idx, dir) {
    if (field.columns[idx]?.locked) return;
    const next = idx + dir;
    if (next < 0 || next >= field.columns.length) return;
    if (field.columns[next]?.locked) return;
    const cols = [...field.columns];
    [cols[idx], cols[next]] = [cols[next], cols[idx]];
    set('columns', cols);
  }

  async function handleExcelImport(e) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (field.columns.length > 0 && !window.confirm('Replace the current columns with the header row from this Excel file?')) return;
    try {
      const ExcelJS = (await import('exceljs')).default;
      const wb = new ExcelJS.Workbook();
      await wb.xlsx.load(await file.arrayBuffer());
      const ws = wb.worksheets[0];
      if (!ws) { alert('That file has no worksheet.'); return; }
      const names = [];
      ws.getRow(1).eachCell({ includeEmpty: false }, cell => {
        const v = cell.value;
        const text = v && typeof v === 'object' ? (v.text ?? v.result ?? '') : v;
        if (text != null && String(text).trim()) names.push(String(text).trim());
      });
      if (names.length === 0) { alert('No header row found in that file.'); return; }
      set('columns', names.map(name => ({ name, type: 'text' })));
    } catch (err) {
      alert(`Could not read that Excel file: ${err?.message || 'unknown error'}`);
    }
  }

  return (
    <div className="df-field" style={{
      borderRadius: 8, border: '1px solid var(--c-border)',
      background: field.active === false ? 'var(--c-soft-bg)' : 'var(--c-card)',
      padding: '12px 13px', display: 'flex', flexDirection: 'column', gap: 10,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <div style={{
          width: 22, height: 22, borderRadius: 6, flexShrink: 0,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: 'var(--c-soft-bg)', border: '1px solid var(--c-border)', color: C.muted,
        }}>
          <TypeIcon size={11} />
        </div>
        <Badge color={field.isCustom === false ? 'gray' : 'purple'}>{field.isCustom === false ? 'Core' : 'Custom'}</Badge>
        {field.active === false && <Badge color="red">Hidden</Badge>}
        <input
          className="ifield" style={{ ...inp, flex: '1 1 160px', width: 'auto', padding: '7px 10px' }}
          placeholder={field.type === 'table' ? 'Table name, e.g. Research Publications' : 'Field name'}
          value={field.label}
          autoComplete="off"
          onChange={e => set('label', e.target.value)}
        />
        <select
          value={field.type}
          onChange={e => onChange({ ...blankField(e.target.value), id: field.id, label: field.label, required: field.required, isCustom: field.isCustom, active: field.active })}
          style={{ ...inp, width: 150, padding: '7px 8px', flexShrink: 0 }}
        >
          {FIELD_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
        </select>

        <div style={{ display: 'flex', alignItems: 'center', gap: 5, flexShrink: 0 }}>
          <button type="button" className="act-btn" title="Move up" aria-label="Move up" onClick={() => onMove(-1)} disabled={index === 0}
            style={{ width: 24, height: 24, borderRadius: 6, border: 'none', cursor: index === 0 ? 'default' : 'pointer', background: index === 0 ? 'transparent' : 'var(--c-soft-bg)', color: index === 0 ? 'rgba(148,163,184,.25)' : C.muted, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M18 15l-6-6-6 6" /></svg>
          </button>
          <button type="button" className="act-btn" title="Move down" aria-label="Move down" onClick={() => onMove(1)} disabled={index === total - 1}
            style={{ width: 24, height: 24, borderRadius: 6, border: 'none', cursor: index === total - 1 ? 'default' : 'pointer', background: index === total - 1 ? 'transparent' : 'var(--c-soft-bg)', color: index === total - 1 ? 'rgba(148,163,184,.25)' : C.muted, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M6 9l6 6 6-6" /></svg>
          </button>
          <button
            type="button" className="act-btn" onClick={onDelete}
            title={field.isCustom === false ? "Core fields can be hidden, not deleted — they stay in the real form" : 'Delete field'}
            style={{ width: 24, height: 24, borderRadius: 6, border: 'none', cursor: 'pointer', background: 'rgba(248,113,113,.1)', color: C.red, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <I.trash size={11} />
          </button>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'center' }}>
        {field.type !== 'computed' && (
          <label style={{ display: 'inline-flex', alignItems: 'center', gap: 7, fontSize: 11, color: C.muted, cursor: 'pointer' }}>
            <input type="checkbox" checked={field.required} onChange={e => set('required', e.target.checked)} />
            Required
          </label>
        )}
        {field.isCustom === false && (
          <label style={{ display: 'inline-flex', alignItems: 'center', gap: 7, fontSize: 11, color: C.muted, cursor: 'pointer' }}>
            <input type="checkbox" checked={field.active !== false} onChange={e => set('active', e.target.checked)} />
            Visible on form
          </label>
        )}
      </div>

      {(field.type === 'dropdown' || field.type === 'conditionalText') && (
        <div>
          <label style={{ ...lbl, marginBottom: 4 }}>Options (one per line)</label>
          <textarea
            className="ifield" style={{ ...inp, minHeight: 64, resize: 'vertical' }}
            value={field.options.join('\n')}
            onChange={e => setOptionsText(e.target.value)}
          />
        </div>
      )}

      {field.type === 'conditionalText' && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <div>
            <label style={{ ...lbl, marginBottom: 4 }}>Show a text box when option is</label>
            <select className="ifield" style={inp} value={field.triggerValue} onChange={e => set('triggerValue', e.target.value)}>
              {(field.options.length ? field.options : ['Other']).map(o => <option key={o} value={o}>{o}</option>)}
            </select>
          </div>
          <div>
            <label style={{ ...lbl, marginBottom: 4 }}>Text box label</label>
            <input className="ifield" style={inp} value={field.extraLabel} onChange={e => set('extraLabel', e.target.value)} placeholder="Please specify" />
          </div>
        </div>
      )}

      {field.type === 'table' && (
        <div>
          <label style={{ display: 'block', marginBottom: 12 }}>
            <span style={{ ...lbl, display: 'block', marginBottom: 4 }}>Guideline <small>(optional — shown to faculty above this table)</small></span>
            <textarea
              className="ifield" style={{ ...inp, width: '100%', minHeight: 70, resize: 'vertical', padding: '7px 9px', whiteSpace: 'pre-wrap' }}
              value={field.guideline ?? ''} placeholder={'e.g.\n1. Attach supporting documents for every entry.\n2. Marks are awarded per verified row.'}
              onChange={e => set('guideline', e.target.value)}
            />
          </label>
          <label style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 16 }}>
            <input type="checkbox" checked={!!field.requireCompleteRows} onChange={e => set('requireCompleteRows', e.target.checked)} />
            Require complete rows
          </label>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10, flexWrap: 'wrap', gap: 8 }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 11, color: C.muted, fontWeight: 700, textTransform: 'uppercase', letterSpacing: .5 }}>
              Total Marks
              <input
                type="number" className="ifield" style={{ ...inp, width: 80, padding: '5px 8px', fontWeight: 700, textTransform: 'none', letterSpacing: 0 }}
                value={field.maxMarks ?? ''} placeholder="—"
                onChange={e => set('maxMarks', e.target.value === '' ? null : Number(e.target.value))}
              />
            </label>
            <div style={{ display: 'flex', gap: 6 }}>
              <input ref={fileInputRef} type="file" accept=".xlsx,.xls" style={{ display: 'none' }} onChange={handleExcelImport} />
              <button type="button" className="act-btn" onClick={() => fileInputRef.current?.click()}
                style={{ ...smBtn, display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                <I.dl size={11} style={{ transform: 'rotate(180deg)' }} /> Import from Excel
              </button>
            </div>
          </div>

          <label style={{ display: 'inline-flex', alignItems: 'center', gap: 7, fontSize: 11, color: C.muted, cursor: 'pointer', marginBottom: 8 }}>
            <input type="checkbox" checked={field.autoSerial !== false} onChange={e => set('autoSerial', e.target.checked)} />
            Auto-number rows (adds a "Sr. No." column automatically — not listed below)
          </label>

          <div style={{ marginBottom: 6 }}>
            <label style={{ ...lbl, marginBottom: 4 }}>Columns</label>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {field.columns.map((col, idx) => (
              <div key={idx} className="df-column-editor" style={col.locked ? { background: `${C.accent}0a`, borderRadius: 8, padding: '8px 10px', border: `1px solid ${C.accent}25` } : undefined}>
                <label className="df-column-name">
                  <span>{col.locked ? 'Column name (fixed, last)' : `Column ${idx + 1} name`}</span>
                <input
                  className="ifield" style={{ ...inp, flex: '1 1 120px', width: 'auto', padding: '6px 9px', opacity: col.locked ? .7 : 1 }}
                  value={col.name}
                  placeholder="Enter column name here"
                  autoComplete="off"
                  readOnly={col.locked}
                  title={col.locked ? 'This column is always named "Faculty Score"' : undefined}
                  onChange={e => updateColumn(idx, { name: e.target.value })}
                />
                </label>
                <label className="df-column-placeholder">
                  <span>Placeholder {col.locked ? '(fixed)' : <small>(optional)</small>}</span>
                  <input
                    className="ifield" style={{ ...inp, opacity: col.locked ? .7 : 1 }} value={col.placeholder ?? ''}
                    placeholder="e.g. Enter publication title" readOnly={col.locked}
                    onChange={e => updateColumn(idx, { placeholder: e.target.value })}
                  />
                </label>
                <label className="df-column-type">
                  <span>Data type{col.locked && ' (locked — whole numbers only)'}</span>
                <select
                  value={col.locked ? 'integer' : col.type} disabled={col.locked} title={col.locked ? 'The Faculty Score column is always a whole number, no decimals' : undefined}
                  onChange={e => updateColumn(idx, { type: e.target.value, maxMarks: isNumericColumn(e.target.value) ? (col.maxMarks ?? null) : null })}
                  style={{ ...inp, width: 130, padding: '6px 8px', flexShrink: 0, opacity: col.locked ? .7 : 1 }}
                >
                  {col.locked
                    ? <option value="integer">Number (Whole)</option>
                    : COLUMN_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                </select>
                </label>
                {isNumericColumn(col.type) && <label className="df-column-max">
                  <span>{col.locked ? <>Total Marks per Row{col.fixedMax && <span style={{ color: C.red }}> * required</span>}</> : <>Max marks <small>(optional)</small></>}</span>
                <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                <input
                  type="number" min="0" step={col.locked ? '1' : 'any'} className="ifield"
                  title={col.locked ? (col.fixedMax ? 'Required — fixed marks per row, independent of Total Marks' : 'Following this table\'s Total Marks — unlock to set a different value') : 'Max marks for this column (optional)'}
                  style={{ ...inp, width: col.locked ? 90 : 60, padding: '6px 8px', flexShrink: 0, opacity: col.locked && !col.fixedMax ? .6 : 1, borderColor: col.locked && col.fixedMax && (col.maxMarks === null || col.maxMarks === undefined) ? C.red : undefined }}
                  value={col.locked ? (col.fixedMax ? (col.maxMarks ?? '') : resolveSelfScoreMax(field, col) ?? '') : (col.maxMarks ?? '')}
                  placeholder={col.locked ? (col.fixedMax ? 'Total Marks per Row' : 'Same as Total Marks') : 'No maximum'}
                  readOnly={col.locked && !col.fixedMax}
                  onChange={e => updateColumn(idx, { maxMarks: e.target.value === '' ? null : Number(e.target.value) })}
                />
                {col.locked && (
                  <button
                    type="button" className="act-btn"
                    onClick={() => updateColumn(idx, { fixedMax: !col.fixedMax, maxMarks: !col.fixedMax ? col.maxMarks : null })}
                    title={col.fixedMax ? 'Fixed — click to follow Total Marks again' : 'Following Total Marks — click to set an independent fixed value'}
                    aria-label={col.fixedMax ? 'Unlock: follow Total Marks' : 'Lock: set a fixed value'}
                    style={{ width: 26, height: 26, borderRadius: 6, border: 'none', cursor: 'pointer', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: col.fixedMax ? `${C.accent}22` : 'var(--c-soft-bg)', color: col.fixedMax ? C.accent : C.muted }}>
                    <I.lock size={12} />
                  </button>
                )}
                </div>
                </label>}
                {col.locked ? (
                  <div className="df-column-actions" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <Badge color="purple">Last · Locked</Badge>
                    <button type="button" className="act-btn" title="Delete this column" aria-label="Delete Faculty Score column" onClick={() => removeLockedColumn(idx)}
                      style={{ width: 28, height: 28, borderRadius: 6, border: 'none', cursor: 'pointer', background: 'rgba(248,113,113,.1)', color: C.red, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                      <I.x size={10} />
                    </button>
                  </div>
                ) : (
                <div className="df-column-actions">
                <button type="button" className="act-btn" onClick={() => moveColumn(idx, -1)} disabled={idx === 0} title="Move column left"
                  style={{ width: 28, height: 28, borderRadius: 6, border: 'none', cursor: idx === 0 ? 'default' : 'pointer', background: idx === 0 ? 'transparent' : 'var(--c-soft-bg)', color: idx === 0 ? 'rgba(148,163,184,.25)' : C.muted, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M15 18l-6-6 6-6" /></svg>
                </button>
                <button type="button" className="act-btn" onClick={() => moveColumn(idx, 1)} disabled={idx === field.columns.length - 1 || field.columns[idx + 1]?.locked} title="Move column right"
                  style={{ width: 28, height: 28, borderRadius: 6, border: 'none', cursor: idx === field.columns.length - 1 ? 'default' : 'pointer', background: idx === field.columns.length - 1 ? 'transparent' : 'var(--c-soft-bg)', color: idx === field.columns.length - 1 ? 'rgba(148,163,184,.25)' : C.muted, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M9 18l6-6-6-6" /></svg>
                </button>
                <button type="button" className="act-btn" title="Remove column" aria-label="Remove column" onClick={() => removeColumn(idx)}
                  style={{ width: 28, height: 28, borderRadius: 6, border: 'none', cursor: 'pointer', background: 'rgba(248,113,113,.1)', color: C.red, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <I.x size={10} />
                </button>
                </div>
                )}
                {(col.type === 'dropdown' || col.type === 'conditionalText') && (
                  <div className="df-column-options">
                    <label>Options (one per line)
                      <textarea className="ifield" style={inp} value={(col.options || ['Option 1', 'Other']).join('\n')} onChange={e => updateColumn(idx, { options: e.target.value.split('\n') })} />
                    </label>
                    {col.type === 'conditionalText' && <>
                      <label>Show text box for
                        <select style={inp} value={col.triggerValue || 'Other'} onChange={e => updateColumn(idx, { triggerValue: e.target.value })}>
                          {[...new Set([col.triggerValue || 'Other', ...(col.options || ['Option 1', 'Other'])])].filter(o => o.trim()).map(o => <option key={o} value={o}>{o}</option>)}
                        </select>
                      </label>
                      <label>Text box label
                        <input style={inp} value={col.extraLabel ?? 'Please specify'} onChange={e => updateColumn(idx, { extraLabel: e.target.value })} />
                      </label>
                    </>}
                  </div>
                )}
              </div>
            ))}
            <button type="button" className="act-btn" onClick={addColumn} style={{ ...smBtn, alignSelf: 'flex-start' }}>
              + Add Column
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── One section, collapsed to a summary row unless it's the open one ────────
function TablesStep({ draft, selectedPart, onSelectPart, onAddPart, onDeletePart, onMovePart, onChange, onAdd, onDelete, onMove, onPartGuidelineChange }) {
  const [partName, setPartName] = useState('');
  const [partError, setPartError] = useState('');
  const parts = draft.parts.length ? draft.parts : ['Part A'];
  const activePart = parts.includes(selectedPart) ? selectedPart : parts[0];
  const sectionsInPart = draft.sections.filter(s => s.part === activePart);
  const items = sectionsInPart.flatMap(section => section.fields.map(field => ({ section, field })))
    .sort((a, b) => {
      const order = draft.tableOrder || [];
      const rank = id => order.includes(id) ? order.indexOf(id) : order.length;
      return rank(a.field.id) - rank(b.field.id);
    });

  function createPart(e) {
    e.preventDefault();
    const name = partName.trim();
    if (!name) { setPartError('Enter a part name.'); return; }
    if (parts.some(p => p.toLowerCase() === name.toLowerCase())) {
      setPartError('A part with this name already exists.'); return;
    }
    onAddPart(name);
    setPartName('');
    setPartError('');
  }

  return (
    <div className="df-sections">
      <div className="df-parts-manager">
        <div className="df-parts-heading"><h3>Parts</h3><span>{parts.length} total</span></div>
        <ol className="df-parts-list" aria-label="Part sequence">
          {parts.map((p, index) => {
            const count = draft.sections.filter(s => s.part === p).reduce((sum, s) => sum + s.fields.filter(f => f.type === 'table').length, 0);
            return <li key={p} className={p === activePart ? 'is-active' : ''}>
              <button type="button" className="df-part-select" aria-pressed={p === activePart} onClick={() => onSelectPart(p)}>
                <span className="df-part-position">{index + 1}</span>
                <span><strong>{p}</strong><small>{count} {count === 1 ? 'table' : 'tables'}</small></span>
              </button>
              <div className="df-part-actions">
                <button type="button" className="df-icon-button" title={`Move ${p} up`} aria-label={`Move ${p} up`} disabled={index === 0} onClick={() => onMovePart(p, -1)}><span style={{ display: 'flex', transform: 'rotate(180deg)' }}><I.chevron size={15} /></span></button>
                <button type="button" className="df-icon-button" title={`Move ${p} down`} aria-label={`Move ${p} down`} disabled={index === parts.length - 1} onClick={() => onMovePart(p, 1)}><I.chevron size={15} /></button>
                <button type="button" className="df-icon-button df-delete" title={parts.length === 1 ? 'At least one part is required' : `Delete ${p}`} aria-label={`Delete ${p}`} disabled={parts.length === 1} onClick={() => onDeletePart(p)}><I.trash size={14} /></button>
              </div>
            </li>;
          })}
        </ol>
        <form className="df-add-part" onSubmit={createPart}>
          <label htmlFor="df-part-name">New part name</label>
          <div><input id="df-part-name" className="ifield" style={inp} placeholder="e.g. Part B - Research" value={partName} onChange={e => { setPartName(e.target.value); setPartError(''); }} aria-invalid={!!partError} aria-describedby={partError ? 'df-part-error' : undefined} />
          <button type="submit" style={oBtn}><I.layers size={14} /> Create part</button></div>
          {partError && <span id="df-part-error" role="alert">{partError}</span>}
        </form>
      </div>
      <div className="df-active-part-heading"><div><h3>{activePart}</h3><span>{items.filter(i => i.field.type === 'table').length} tables</span></div>
        <button type="button" className="df-add-section" onClick={() => onAdd(activePart)}><I.layers size={16} /> Create Table</button>
      </div>

      <label style={{ display: 'block', margin: '0 0 14px' }}>
        <span style={{ ...lbl, display: 'block', marginBottom: 4 }}>Part guideline <small>(optional — shown to faculty above {activePart})</small></span>
        <textarea
          className="ifield" style={{ ...inp, width: '100%', minHeight: 60, resize: 'vertical', padding: '7px 9px', whiteSpace: 'pre-wrap' }}
          value={(draft.partGuidelines || {})[activePart] ?? ''}
          placeholder={`e.g.\n1. This part covers teaching-related activities for the appraisal year.\n2. Attach supporting documents where asked.`}
          onChange={e => onPartGuidelineChange(activePart, e.target.value)}
        />
      </label>

      {items.length === 0 && <div className="df-library-empty">No tables in {activePart} yet.</div>}
      <div className="df-part-tables">
        {items.map(({ section, field }, index) => (
          <div key={field.id}>
            {section.active === false && <label className="df-retired-item">
              <input type="checkbox" checked={false} onChange={() => onChange(section.id, { ...section, active: true })} />
              Restore retired items
            </label>}
            <FieldRow field={field} index={index} total={items.length}
              onChange={next => onChange(section.id, { ...section, fields: section.fields.map(f => f.id === field.id ? next : f) })}
              onMove={direction => onMove(activePart, field.id, direction)}
              onDelete={() => onDelete(section.id, field.id)} />
          </div>
        ))}
      </div>
      {items.length > 0 && <button type="button" className="df-add-section df-add-section-bottom" onClick={() => onAdd(activePart)}>
        <I.layers size={16} /> Create Table <span>in {activePart}</span>
      </button>}
    </div>
  );
}

// ── A single live, fillable input — the one primitive every field/cell uses ──
function LiveInput({ type, value, onChange, placeholder, options, compact }) {
  const [dateInvalid, setDateInvalid] = useState(false);

  if (type === 'computed') {
    return (
      <div style={{ ...inp, background: 'var(--c-soft-bg)', color: C.muted, cursor: 'not-allowed', fontStyle: 'italic' }}>
        Auto-calculated
      </div>
    );
  }
  if (type === 'file') {
    function pick(e) {
      const file = e.target.files?.[0];
      if (!file) return;
      onChange({ name: file.name, url: URL.createObjectURL(file) });
    }
    // Compact = icon-only pair, used inside a table cell so a narrow "Document"
    // column doesn't blow out the row layout; full labeled version elsewhere.
    if (compact) {
      return (
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <label className="act-btn" title={value ? `Replace ${value.name}` : 'Upload document'}
            style={{ width: 26, height: 26, borderRadius: 6, flexShrink: 0, border: '1px solid var(--c-border)', background: 'var(--c-soft-bg)', color: C.muted, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
            <I.dl size={12} style={{ transform: 'rotate(180deg)' }} />
            <input type="file" style={{ display: 'none' }} onChange={pick} />
          </label>
          {value && (
            <a href={value.url} target="_blank" rel="noreferrer" title={`View ${value.name}`}
              style={{ width: 26, height: 26, borderRadius: 6, flexShrink: 0, border: `1px solid ${C.accent}45`, background: `${C.accent}14`, color: C.accent, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <I.eye size={12} />
            </a>
          )}
        </div>
      );
    }
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <label className="act-btn" style={{ ...smBtn, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          <I.dl size={11} style={{ transform: 'rotate(180deg)' }} /> {value ? 'Replace Document' : 'Upload Document'}
          <input type="file" style={{ display: 'none' }} onChange={pick} />
        </label>
        {value && (
          <a href={value.url} target="_blank" rel="noreferrer"
            style={{ fontSize: 11.5, color: C.accent, display: 'inline-flex', alignItems: 'center', gap: 5, textDecoration: 'none', fontWeight: 600 }}>
            <I.eye size={12} /> View {value.name}
          </a>
        )}
      </div>
    );
  }
  if (type === 'checkbox') {
    return (
      <label style={{ display: 'inline-flex', alignItems: 'center', gap: 7, fontSize: 12, color: C.subtle, cursor: 'pointer' }}>
        <input type="checkbox" checked={!!value} onChange={e => onChange(e.target.checked)} /> Yes / No
      </label>
    );
  }
  if (type === 'date') {
    return (
      <div>
        <input
          className="ifield" style={{ ...inp, maxWidth: 170, borderColor: dateInvalid ? C.red : undefined }}
          placeholder={placeholder || 'DD/MM/YYYY'} inputMode="numeric"
          value={value || ''}
          onChange={e => onChange(maskDateDDMMYYYY(e.target.value))}
          onBlur={() => setDateInvalid(Boolean(value) && !isValidDDMMYYYY(value))}
        />
        {dateInvalid && <div style={{ fontSize: 10, color: C.red, marginTop: 4 }}>Enter a valid date (DD/MM/YYYY).</div>}
      </div>
    );
  }
  if (type === 'number' || type === 'integer') {
    return (
      <input
        className="ifield" style={{ ...inp, maxWidth: 160, textAlign: 'right', fontFamily: "'JetBrains Mono',monospace" }}
        inputMode={type === 'integer' ? 'numeric' : 'decimal'} placeholder={placeholder || '0'}
        value={value || ''}
        onChange={e => onChange(filterNumeric(e.target.value, { integer: type === 'integer' }))}
      />
    );
  }
  if (type === 'textarea') {
    return <textarea className="ifield" style={{ ...inp, minHeight: 60, resize: 'vertical' }} value={value || ''} onChange={e => onChange(e.target.value)} placeholder={placeholder} />;
  }
  if (type === 'dropdown') {
    return (
      <select className="ifield" style={{ ...inp, maxWidth: 280 }} value={value || ''} onChange={e => onChange(e.target.value)}>
        <option value="" disabled>{placeholder || 'Select...'}</option>
        {(options?.length ? options : ['Option 1']).map(o => <option key={o} value={o}>{o}</option>)}
      </select>
    );
  }
  return <input className="ifield" style={inp} value={value || ''} onChange={e => onChange(e.target.value)} placeholder={placeholder} />;
}

// ── A live table: real add/remove-row, Sr. No. auto column, typed cells ─────
function TableCell({ column, value, onChange }) {
  if (column.type === 'conditionalText') {
    return <div className="df-conditional-cell">
      <LiveInput type="dropdown" placeholder={column.placeholder} options={column.options} value={value?.choice} onChange={choice => onChange({ choice, extra: '' })} />
      {value?.choice === (column.triggerValue || 'Other') &&
        <label>{column.extraLabel || 'Please specify'}
          <LiveInput type="text" value={value?.extra} onChange={extra => onChange({ ...value, extra })} />
        </label>}
    </div>;
  }
  if (column.type === 'checkbox') {
    return <select style={inp} aria-label={column.name} value={value == null ? '' : String(value)} onChange={e => onChange(e.target.value === '' ? undefined : e.target.value === 'true')}>
      <option value="">{column.placeholder || 'Select...'}</option><option value="true">Yes</option><option value="false">No</option>
    </select>;
  }
  return <div>
    <LiveInput type={column.type} placeholder={column.placeholder} options={column.options?.filter(o => o.trim())} value={value} onChange={onChange} compact />
    {(column.type === 'file' || column.type === 'computed') && column.placeholder && <small className="df-cell-hint">{column.placeholder}</small>}
  </div>;
}

function LiveTable({ field, rows, onRowsChange }) {
  const list = rows.length ? rows : [{}];
  const autoSerial = field.autoSerial !== false;
  const incomplete = incompleteTableRows(field, list);

  function updateCell(rowIdx, colName, val) {
    const next = [...list];
    next[rowIdx] = { ...next[rowIdx], [colName]: val };
    onRowsChange(next);
  }
  function addRow() {
    onRowsChange([...list, {}]);
  }
  function removeLastRow() {
    if (list.length <= 1) return;
    onRowsChange(list.slice(0, -1));
  }

  return (
    <div className="df-live-table" role="region" aria-label={field.label || 'Table preview'} tabIndex={0} style={{ overflowX: 'auto', borderRadius: 8, border: '1px solid var(--c-border)' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11.5 }}>
        <thead>
          <tr>
            {autoSerial && (
              <th style={{ textAlign: 'left', padding: '7px 10px', background: 'var(--c-soft-bg)', color: C.muted, fontWeight: 700, borderBottom: '1px solid var(--c-border)', width: 46 }}>Sr.</th>
            )}
            {field.columns.map((c, i) => (
              <th key={i} style={{ textAlign: 'left', padding: '7px 10px', background: 'var(--c-soft-bg)', color: C.muted, fontWeight: 700, borderBottom: '1px solid var(--c-border)' }}>
                <span className="df-preview-column-name">{c.name || `Column ${i + 1}`}</span>
                <span className="df-preview-column-meta">{COLUMN_TYPES.find(t => t.value === c.type)?.label || c.type}{isNumericColumn(c.type) && resolveSelfScoreMax(field, c) != null && <span> / Max {resolveSelfScoreMax(field, c)}</span>}</span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {list.map((row, ri) => (
            <tr key={ri}>
              {autoSerial && (
                <td style={{ padding: '8px 10px', color: C.muted, borderTop: ri > 0 ? '1px solid var(--c-divider)' : 'none' }}>{ri + 1}</td>
              )}
              {field.columns.map((c, ci) => (
                <td key={ci} style={{ padding: '6px 8px', borderTop: ri > 0 ? '1px solid var(--c-divider)' : 'none', minWidth: c.type === 'file' ? 70 : 120 }}>
                  <TableCell column={c} value={row[c.name]} onChange={v => updateCell(ri, c.name, v)} />
                  {incomplete.some(error => error.row === ri + 1 && error.missing.includes(c.name)) && <div style={{ color: C.red, marginTop: 6, fontSize: 11 }}>Required to complete row</div>}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      {incomplete.length > 0 && <p role="status" style={{ color: C.red, padding: 12, fontSize: 12 }}>Complete rows {incomplete.map(e => e.row).join(', ')} before submitting.</p>}
      <div style={{ display: 'flex', gap: 8, padding: '8px 10px', borderTop: '1px dashed var(--c-border)' }}>
        <button type="button" className="act-btn" onClick={addRow} style={{ ...smBtn, padding: '4px 10px' }}>+ Add Row</button>
        <button type="button" className="act-btn" onClick={removeLastRow} disabled={list.length <= 1}
          style={{ ...smBtn, padding: '4px 10px', opacity: list.length <= 1 ? .5 : 1, cursor: list.length <= 1 ? 'default' : 'pointer' }}>
          Remove Last Row
        </button>
      </div>
    </div>
  );
}

// ── Step 3: Preview — try filling out the actual form, one section per page ──
function PreviewStep({ draft }) {
  const [rowValidation, setRowValidation] = useState('');
  const [values, setValues] = useState({});
  const [condExtra, setCondExtra] = useState({});
  const [tableRows, setTableRows] = useState({});
  useEffect(() => setRowValidation(''), [tableRows]);
  const [page, setPage] = useState(0);
  const FIcon = I[draft.iconName] || I.doc;

  const setValue = (id, v) => setValues(prev => ({ ...prev, [id]: v }));
  const order = draft.tableOrder || [];
  const rank = id => order.includes(id) ? order.indexOf(id) : order.length;
  const visibleSections = draft.parts.map(part => ({
    id: part, title: part,
    fields: draft.sections.filter(s => s.part === part && s.active !== false)
      .flatMap(s => s.fields).sort((a, b) => rank(a.id) - rank(b.id)),
  }));
  const current = visibleSections[Math.min(page, visibleSections.length - 1)];
  const visibleFields = current ? current.fields.filter(f => f.active !== false) : [];
  function validateRows() {
    const failures = visibleSections.flatMap(section => section.fields
      .filter(f => f.active !== false && f.type === 'table')
      .flatMap(f => incompleteTableRows(f, tableRows[f.id]).map(error =>
        `${section.title}: ${f.label || 'Table'}, row ${error.row} - ${error.missing.join(', ')}`)));
    setRowValidation(failures.length ? `Incomplete rows: ${failures.join('; ')}` : 'All started rows are complete.');
  }

  return (
    <div className="df-preview">
      <div className="df-row-validation">
        <button type="button" style={oBtn} onClick={validateRows}><I.check size={14} /> Validate rows</button>
        {rowValidation && <span role="status">{rowValidation}</span>}
      </div>
      <div className="df-preview-note" style={{
        display: 'flex', alignItems: 'center', gap: 9, padding: '9px 13px', borderRadius: 10,
        background: `${C.accent}0d`, border: `1px solid ${C.accent}28`, marginBottom: 14, fontSize: 11.5, color: C.subtle,
      }}>
        <I.idea size={13} stroke={C.accent} style={{ flexShrink: 0 }} />
        This is fully interactive — try typing, picking dropdowns, and adding table rows to see exactly how the form behaves.
        
      </div>

      <div style={{
        borderRadius: 8, border: '1px solid var(--c-border)', background: 'var(--c-bg)', overflow: 'hidden',
      }}>
        <div style={{
          padding: '20px 24px', background: `linear-gradient(135deg, ${draft.color}14 0%, ${draft.color}05 100%)`,
          borderBottom: `1px solid ${draft.color}30`, display: 'flex', alignItems: 'center', gap: 14,
        }}>
          <div style={{
            width: 42, height: 42, borderRadius: 11, flexShrink: 0,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: `${draft.color}22`, border: `1px solid ${draft.color}45`, color: draft.color,
          }}>
            <FIcon size={19} />
          </div>
          <div>
            <div style={{ fontSize: 16, fontWeight: 800, color: C.text }}>{draft.label || 'Untitled Form'}</div>
            {draft.desc && <div style={{ fontSize: 12, color: C.muted, marginTop: 3 }}>{draft.desc}</div>}
          </div>
        </div>

        {visibleSections.length === 0 ? (
          <div style={{ fontSize: 12.5, color: C.muted, textAlign: 'center', padding: '40px 24px' }}>
            Create a table in a part to see the preview.
          </div>
        ) : (
          <>
            {/* Page tabs — one per section, so it reads as a paginated form, not one long scroll */}
            <div style={{
              display: 'flex', gap: 6, overflowX: 'auto', padding: '12px 24px',
              borderBottom: '1px solid var(--c-divider)', background: 'var(--c-soft-bg)',
            }}>
              {visibleSections.map((s, i) => {
                const active = i === page;
                return (
                  <button key={s.id} type="button" className="act-btn" onClick={() => setPage(i)}
                    style={{
                      flexShrink: 0, display: 'flex', alignItems: 'center', gap: 6, padding: '6px 12px',
                      borderRadius: 20, cursor: 'pointer', fontSize: 11.5, fontWeight: 700, whiteSpace: 'nowrap',
                      border: `1px solid ${active ? draft.color : 'var(--c-border)'}`,
                      background: active ? `${draft.color}20` : 'var(--c-card)',
                      color: active ? draft.color : C.muted,
                    }}>
                    <span style={{
                      width: 16, height: 16, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: 9.5, background: active ? draft.color : 'var(--c-soft-bg)', color: active ? '#fff' : C.muted, flexShrink: 0,
                    }}>
                      {i + 1}
                    </span>
                    {s.title || 'Untitled part'}
                  </button>
                );
              })}
            </div>

            <div style={{ padding: '22px 24px', display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div style={{ fontSize: 10.5, color: C.muted, fontWeight: 700, letterSpacing: .4, textTransform: 'uppercase' }}>
                Page {page + 1} of {visibleSections.length}
              </div>
              {(draft.partGuidelines || {})[current?.title]?.trim() && (
                <div style={{ fontSize: 11.5, color: C.muted, background: 'var(--c-soft-bg)', border: '1px solid var(--c-border)', borderRadius: 8, padding: '9px 12px', whiteSpace: 'pre-wrap' }}>
                  {draft.partGuidelines[current.title]}
                </div>
              )}

              {visibleFields.length === 0 ? (
                <div style={{ fontSize: 11.5, color: C.muted }}>No tables in this part yet.</div>
              ) : visibleFields.map(f => (
                <div key={f.id}>
                  <label style={lbl}>
                    {f.label || 'Untitled field'} {f.required && <span style={{ color: C.red }}>*</span>}
                    {f.type === 'table' && f.maxMarks != null && (
                      <span style={{ marginLeft: 8, textTransform: 'none', letterSpacing: 0, fontWeight: 600, color: C.accent }}>
                        Total: {f.maxMarks} marks
                      </span>
                    )}
                  </label>
                  {f.type === 'table' && f.guideline?.trim() && (
                    <div style={{ fontSize: 11.5, color: C.muted, background: 'var(--c-soft-bg)', border: '1px solid var(--c-border)', borderRadius: 8, padding: '8px 11px', marginBottom: 8, whiteSpace: 'pre-wrap' }}>
                      {f.guideline}
                    </div>
                  )}

                  {f.type === 'table' ? (
                    <LiveTable
                      field={f}
                      rows={tableRows[f.id] || [{}]}
                      onRowsChange={rows => setTableRows(prev => ({ ...prev, [f.id]: rows }))}
                    />
                  ) : f.type === 'conditionalText' ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                      <LiveInput type="dropdown" options={f.options} value={values[f.id]} onChange={v => setValue(f.id, v)} />
                      {values[f.id] === f.triggerValue && (
                        <div>
                          <label style={{ ...lbl, marginBottom: 4 }}>{f.extraLabel || 'Please specify'}</label>
                          <LiveInput type="text" value={condExtra[f.id]} onChange={v => setCondExtra(prev => ({ ...prev, [f.id]: v }))} />
                        </div>
                      )}
                    </div>
                  ) : (
                    <LiveInput type={f.type} options={f.options} value={values[f.id]} onChange={v => setValue(f.id, v)} />
                  )}
                </div>
              ))}

              <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 8, paddingTop: 16, borderTop: '1px solid var(--c-divider)' }}>
                <button type="button" className="act-btn" style={oBtn} disabled={page === 0} onClick={() => setPage(p => Math.max(0, p - 1))}>
                  ← Previous Part
                </button>
                <button type="button" className="act-btn" style={oBtn} disabled={page === visibleSections.length - 1} onClick={() => setPage(p => Math.min(visibleSections.length - 1, p + 1))}>
                  Next Part →
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ── Step 4: Publish — summary + the actual save/publish actions ─────────────
function PublishStep({ draft, msg, onSaveDraft, onPublish, onUnpublish }) {
  const FIcon = I[draft.iconName] || I.doc;
  return (
    <div className="df-publish">
      <div style={{
        display: 'flex', alignItems: 'center', gap: 14, padding: '16px 18px', borderRadius: 12,
        background: 'var(--c-soft-bg)', border: '1px solid var(--c-border)', marginBottom: 16,
      }}>
        <div style={{
          width: 40, height: 40, borderRadius: 10, flexShrink: 0,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: `${draft.color}20`, border: `1px solid ${draft.color}40`, color: draft.color,
        }}>
          <FIcon size={18} />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: C.text }}>{draft.label || 'Untitled Form'}</div>
          <div style={{ fontSize: 11, color: C.muted, marginTop: 2 }}>
            {draft.parts.length} parts / {tableCount(draft)} tables
          </div>
        </div>
        <Badge color={draft.published ? 'green' : 'gray'}>{draft.backendManaged ? (draft.published ? 'Active schema' : 'Inactive schema') : 'Local draft'}</Badge>
      </div>

      {msg && (
        <div style={{ marginBottom: 14, padding: '8px 12px', borderRadius: 8, background: `${C.accent}10`, border: `1px solid ${C.accent}28`, fontSize: 11.5, color: C.subtle }}>
          {msg}
        </div>
      )}

      <div style={{
        display: 'flex', alignItems: 'flex-start', gap: 10, padding: '11px 14px', borderRadius: 11,
        background: `${C.yellow}0d`, border: `1px solid ${C.yellow}30`, marginBottom: 20, fontSize: 11.5, color: C.subtle, lineHeight: 1.6,
      }}>
        <I.idea size={15} stroke={C.yellow} style={{ flexShrink: 0, marginTop: 1 }} />
        <span>
          Save writes schema records to the backend, and new/edited tables go live immediately —
          there's no separate publish step, so double-check a table before saving if it's not
          ready for faculty yet. A table you've individually retired (via "Restore retired
          items") stays retired even if you save other changes here.
          Form name, description, color and icon are remembered in this browser only.
          Activation/deactivation below bulk-sets every table in this form at once — it does not
          register a school form or enable faculty submission validation on its own.
        </span>
      </div>

      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        <button className="act-btn" style={oBtn} onClick={onSaveDraft}>Save schema</button>
        {draft.published ? (
          <button className="act-btn" style={{ ...oBtn, color: C.yellow, borderColor: `${C.yellow}45` }} onClick={onUnpublish}>
            Deactivate all tables
          </button>
        ) : (
          <button className="act-btn" style={pBtn} onClick={onPublish}>
            <I.check size={14} /> Activate all tables
          </button>
        )}
      </div>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function DynamicFormPage() {
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [forms, setForms] = useState([]);
  const [busy, setBusy] = useState(false);
  const [syncError, setSyncError] = useState('');
  const [operationNotice, setOperationNotice] = useState('');
  const [draft, setDraft] = useState(null);
  const [step, setStep] = useState(0);
  const [dir, setDir] = useState('forward');
  const [selectedPart, setSelectedPart] = useState('');
  const [previewNonce, setPreviewNonce] = useState(0);
  const [msg, setMsg] = useState('');
  const publishedCount = forms.filter(f => f.published).length;

  async function refresh() {
    const remote = await schemaStore.load(readFormMetadata());
    const imported = new Set(Object.values(readFormMetadata()).map(m => m.sourceKey).filter(Boolean));
    const local = getDynamicForms().filter(f => !imported.has(f.key)).map(f => ({ ...f, published: false }));
    setForms([...remote, ...local]);
  }
  useEffect(() => {
    setBusy(true);
    refresh().catch(e => setSyncError(e.message)).finally(() => setBusy(false));
  }, []);

  function openDraft(form) {
    setDraft(form);
    setStep(0);
    setSelectedPart(form.parts?.[0] || '');
    setMsg('');
  }
  function startNew() {
    openDraft(blankDraft());
  }
  function selectForm(f) {
    openDraft({ ...f, sections: f.sections.map(s => ({ ...s, fields: s.fields.map(fl => ({ ...fl })) })) });
  }
  async function deleteForm(f) {
    const hasCore = f.backendManaged && f.sections.some(s => s.isCore);
    const confirmation = hasCore
      ? `Retire "${f.label}"? Core records will become inactive and remain in the library to preserve existing data. Custom records in this family will be deleted.`
      : `Delete "${f.label || 'this form'}"? This can't be undone.`;
    if (!window.confirm(confirmation)) return;
    setBusy(true);
    setSyncError('');
    setOperationNotice('');
    try {
      let result;
      if (f.backendManaged) result = await schemaStore.remove(f);
      else { deleteDynamicForm(f.key); result = { deleted: 1, retired: 0 }; }
      await refresh();
      if (draft?.key === f.key) setDraft(null);
      setOperationNotice(result.retired
        ? `"${f.label}": ${result.deleted} records deleted; ${result.retired} core records retired. This family remains listed as inactive because the backend preserves core schemas. Permanent family removal is not supported by this API.`
        : `"${f.label}" deleted successfully.`);
    } catch (e) {
      setSyncError(`Deletion incomplete: ${e.message}. Some requests may already have succeeded.`);
      try { await refresh(); } catch { /* Keep the original deletion error visible. */ }
    }
    finally { setBusy(false); }
  }

  function updateDraft(patch) {
    setDraft(d => ({ ...d, ...patch }));
  }
  function addTable(part) {
    const field = { ...blankField('table'), label: 'Untitled table' };
    const section = { ...newSection(0, part), title: field.label, fields: [field] };
    setDraft(d => ({ ...d, sections: [...d.sections, section] }));
  }
  function deleteTable(sectionId, fieldId) {
    const section = draft.sections.find(s => s.id === sectionId);
    const field = section.fields.find(f => f.id === fieldId);
    const core = field.isCustom === false || section.isCore;
    if (!window.confirm(core ? 'Hide this core item? Existing data will be preserved.' : 'Delete this table and its columns?')) return;
    setDraft(d => ({ ...d, sections: d.sections.map(s => s.id !== sectionId ? s : {
      ...s, fields: core ? s.fields.map(f => f.id === fieldId ? { ...f, active: false } : f) : s.fields.filter(f => f.id !== fieldId),
    }) }));
  }
  function moveTable(part, id, direction) {
    setDraft(d => {
      const order = d.tableOrder || [];
      const rank = key => order.includes(key) ? order.indexOf(key) : order.length;
      const ids = d.sections.filter(s => s.part === part).flatMap(s => s.fields.map(f => f.id)).sort((a, b) => rank(a) - rank(b));
      const index = ids.indexOf(id), target = index + direction;
      if (index < 0 || target < 0 || target >= ids.length) return d;
      [ids[index], ids[target]] = [ids[target], ids[index]];
      return { ...d, tableOrder: [...order.filter(key => !ids.includes(key)), ...ids] };
    });
  }
  function setPartGuideline(part, text) {
    setDraft(d => ({ ...d, partGuidelines: { ...d.partGuidelines, [part]: text } }));
  }
  function addPart(name) {
    const trimmed = name.trim();
    if (!trimmed || draft.parts.some(p => p.toLowerCase() === trimmed.toLowerCase())) return;
    setDraft(d => ({ ...d, parts: [...d.parts, trimmed] }));
    setSelectedPart(trimmed);
  }
  function movePart(part, direction) {
    setDraft(d => {
      const index = d.parts.indexOf(part);
      const target = index + direction;
      if (index < 0 || target < 0 || target >= d.parts.length) return d;
      const parts = [...d.parts];
      [parts[index], parts[target]] = [parts[target], parts[index]];
      return { ...d, parts };
    });
  }
  function deletePart(part) {
    if (draft.parts.length <= 1) { setMsg('Add another part first — a form needs at least one.'); return; }
    const inPart = draft.sections.filter(s => s.part === part);
    const customCount = inPart.filter(s => !s.isCore).reduce((sum, s) => sum + s.fields.length, 0);
    const coreCount = inPart.filter(s => s.isCore).reduce((sum, s) => sum + s.fields.length, 0);
    const bits = [];
    if (customCount) bits.push(`delete ${customCount} item${customCount === 1 ? '' : 's'}`);
    if (coreCount) bits.push(`retire ${coreCount} core item${coreCount === 1 ? '' : 's'} (preserved as hidden records)`);
    if (!window.confirm(`Delete "${part}"?${bits.length ? ` This will ${bits.join(' and ')}.` : ''}`)) return;
    setDraft(d => {
      const { [part]: _removed, ...partGuidelines } = d.partGuidelines || {};
      return {
        ...d,
        parts: d.parts.filter(p => p !== part),
        partGuidelines,
        sections: d.sections
          .filter(s => s.part !== part || s.isCore)
          .map(s => (s.part === part ? { ...s, active: false } : s)),
      };
    });
    if (selectedPart === part) {
      const remaining = draft.parts.filter(p => p !== part);
      setSelectedPart(remaining[0] || '');
    }
  }
  function updateSection(id, next) {
    setDraft(d => ({ ...d, sections: d.sections.map(s => s.id === id ? next : s) }));
  }
  function goStep(next) {
    if (step === 0 && next > step && !draft.label.trim()) { setMsg('Give the form a name first.'); return; }
    jumpToStep(next);
  }
  // Clicking a step tab directly always works — no need to click through
  // Continue first to reach Preview (or any other step).
  function jumpToStep(next) {
    setMsg('');
    setDir(next > step ? 'forward' : 'backward');
    if (next === 2) setPreviewNonce(n => n + 1);
    setStep(next);
  }

  async function persistSchema(activate) {
    if (busy) return;
    if (!draft.label.trim()) { setMsg('Give the form a name first.'); return; }
    if (!fieldCount(draft)) { setMsg('Create at least one table before saving.'); return; }
    const missingSelfScore = findMissingSelfScoreMax(draft.sections);
    if (missingSelfScore.length) {
      setMsg(`Set a "Total Marks per Row" value for the Faculty Score column in: ${missingSelfScore.map(p => `${p.fieldLabel || 'table'} (${p.sectionTitle})`).join(', ')}.`);
      return;
    }
    const meta = readFormMetadata();
    const remembered = Object.entries(meta).find(([, m]) => m.sourceKey && m.sourceKey === draft.key)?.[0];
    const family = draft.backendFamily || remembered || `custom_${crypto.randomUUID().replaceAll('-', '')}`;
    const working = { ...draft, backendFamily: family };
    setDraft(working);
    setBusy(true);
    setSyncError('');
    setMsg('');
    try {
      const savedForms = await schemaStore.save(working, { activate });
      meta[family] = { label: working.label, desc: working.desc, color: working.color, iconName: working.iconName, partGuidelines: working.partGuidelines || {}, sourceKey: working.backendManaged ? meta[family]?.sourceKey : working.key };
      writeFormMetadata(meta);
      const saved = savedForms.find(f => f.backendFamily === family);
      if (!saved) throw new Error('Save could not be verified by reloading the backend.');
      setDraft(saved);
      await refresh();
      notifyCustomFormFamiliesChanged();
      setMsg(activate === true ? 'Schemas activated on the backend. Now selectable as a school\'s Appraisal Form — faculty rendering must still be configured separately.' : activate === false ? 'Schemas deactivated on the backend.' : 'Schema saved and reloaded from the backend.');
    } catch (e) { setSyncError(e.message); }
    finally { setBusy(false); }
  }
  function handleSaveDraft() { return persistSchema(); }
  function handlePublish() {
    if (window.confirm('Activate all enabled schema records in this form? This is not school registration. The faculty renderer and submission validation must support this schema.')) return persistSchema(true);
  }
  function handleUnpublish() {
    if (window.confirm('Deactivate all schema records in this form? They will be excluded from the faculty schema API.')) return persistSchema(false);
  }

  return (
    <div className={`dynamic-form-page ${mobileNavOpen ? 'df-mobile-nav-open' : ''}`}>
      <button type="button" className="df-mobile-navigation" aria-expanded={mobileNavOpen} onClick={() => setMobileNavOpen(open => !open)}>
        {mobileNavOpen ? <I.x size={16} /> : <I.list size={16} />} {mobileNavOpen ? 'Close navigation' : 'Navigation'}
      </button>
      <div className="df-page-heading">
        <PageHead title="Dynamic Form" sub="Appraisal form management" />
        <div className="df-library-stats" aria-label="Form totals">
          <span><strong>{forms.length}</strong> Saved forms</span>
          <span><i className="df-dot" /><strong>{publishedCount}</strong> Active schemas</span>
          <span><strong>{forms.length - publishedCount}</strong> Inactive / local</span>
        </div>
      </div>
      {syncError && <div className="df-message" role="alert">{syncError} <button type="button" style={oBtn} disabled={busy} onClick={() => { setBusy(true); refresh().then(() => setSyncError('')).catch(e => setSyncError(e.message)).finally(() => setBusy(false)); }}>Reload schemas</button></div>}
      {operationNotice && <div className="df-message" role="status">{operationNotice}</div>}
      {busy && <p role="status">Synchronizing schemas...</p>}
      <fieldset disabled={busy} aria-busy={busy} style={{ border: 0, padding: 0, margin: 0, minWidth: 0 }}>
      <div className="df-workspace">
        <FormsList forms={forms} activeKey={draft?.key} onSelect={selectForm} onNew={startNew} onDelete={deleteForm} />
        {!draft ? (
          <main className="df-empty">
            <I.workflow size={44} />
            <h2>Create your next appraisal form</h2>
            <button type="button" style={pBtn} onClick={startNew}><I.edit size={16} /> New form</button>
          </main>
        ) : (
          <main className="df-editor">
            <header className="df-editor-heading">
              <div className="df-editor-identity">
                <span className="df-form-icon" style={{ color: draft.color }}>{(() => { const Icon = I[draft.iconName] || I.doc; return <Icon size={22} />; })()}</span>
                <div>
                  <div className="df-eyebrow">{draft.key ? 'Edit form' : 'New form'} <Badge color={draft.published ? 'green' : 'gray'}>{draft.published ? 'Published' : 'Draft'}</Badge></div>
                  <h2>{draft.label || 'Untitled form'}</h2>
                  <p>{draft.parts.length} parts / {tableCount(draft)} tables</p>
                </div>
              </div>
              <button className="df-icon-button" title="Close editor" aria-label="Close editor" onClick={() => setDraft(null)}><I.x size={18} /></button>
            </header>
            <Stepper current={step} onStepClick={jumpToStep} />
            <div className="df-step-content">
              <div className="df-step-heading"><h3>{STEPS[step].label}</h3><span>Step {step + 1} of {STEPS.length}</span></div>
              <div key={step} className="df-step-panel" style={{ animation: `${dir === 'forward' ? 'slideInRight' : 'slideInLeft'} .2s ease both` }}>
                {step === 0 && <DetailsStep draft={draft} updateDraft={updateDraft} />}
                {step === 1 && <TablesStep draft={draft} selectedPart={selectedPart} onSelectPart={setSelectedPart} onAddPart={addPart} onDeletePart={deletePart} onMovePart={movePart} onChange={updateSection} onAdd={addTable} onDelete={deleteTable} onMove={moveTable} onPartGuidelineChange={setPartGuideline} />}
                {step === 2 && <PreviewStep key={previewNonce} draft={draft} />}
                {step === 3 && <PublishStep draft={draft} msg={msg} onSaveDraft={handleSaveDraft} onPublish={handlePublish} onUnpublish={handleUnpublish} />}
              </div>
              {msg && step !== 3 && <div className="df-message" role="status">{msg}</div>}
            </div>
            <footer className="df-editor-footer">
              <div>{step > 0 && <button className="act-btn" style={oBtn} onClick={() => goStep(step - 1)}>Back</button>}</div>
              <span>{STEPS[step].label}</span>
              {step < STEPS.length - 1 ? <button className="act-btn" style={pBtn} onClick={() => goStep(step + 1)}>{step === 1 ? 'Preview form' : step === 2 ? 'Review & publish' : 'Continue to tables'}</button> : <span />}
            </footer>
          </main>
        )}
      </div>
      </fieldset>
    </div>
  );
}

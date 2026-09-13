import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { C } from '../../constants/colors';
import { api } from '../../api/client';
import { inp, lbl, pBtn, oBtn } from '../../constants/styleTokens';
import Card from '../../components/Card';
import PageHead from '../../components/PageHead';
import { I } from '../../components/icons';
import {
  SL, TrackPicker, ToggleRow, ChainBuilder, DepartmentEditor, FormPicker,
} from '../../components/schools/SchoolForm';
import {
  SCHOOL_CHAIN_MAP, SCHOOL_TRACKS, getAllSchoolForms,
  deanLabelForTrack, suggestSchoolCode, defaultChainFor,
  selectedSchoolFormKey, schoolFormPayload, cacheSchoolFormSelection,
} from '../../constants/schoolRoles';
import { useCustomFormFamilies } from '../../utils/backendFormFamilies';

const EMPTY_SCHOOL = {
  code: '', full_name: '', track: 'engineering',
  has_hod: false, has_director: true,
  approval_chain: ['director', 'dean', 'vc'],
  departments: [], default_form: 'standard', form_variant: 'standard', active: true,
};

const STEPS = [
  { label: 'Identity',  sub: 'Name, code & type',        icon: I.bldg },
  { label: 'Structure', sub: 'HOD, Director & depts',     icon: I.layers },
  { label: 'Chain',     sub: 'Approval order',            icon: I.workflow },
  { label: 'Form',      sub: 'Appraisal form & status',   icon: I.doc },
];

// ── Stepper — smooth, animated, matches the Add User wizard ────────────────────
function Stepper({ current }) {
  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', marginBottom: 28 }}>
      {STEPS.map((s, i) => {
        const done   = i < current;
        const active = i === current;
        const col    = done ? C.green : active ? C.accent : 'var(--c-border)';
        const isLast = i === STEPS.length - 1;
        const StepIcon = s.icon;
        return (
          <div key={i} style={{ display: 'flex', alignItems: 'flex-start', flex: isLast ? 'none' : 1 }}>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 5, flexShrink: 0 }}>
              <div style={{
                width: 30, height: 30, borderRadius: '50%',
                border: `2px solid ${col}`,
                background: done ? C.green : active ? `${C.accent}1a` : 'transparent',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                color: done ? '#fff' : col,
                transition: 'all .3s cubic-bezier(.22,1,.36,1)', flexShrink: 0,
              }}>
                {done ? <I.check size={13} /> : <StepIcon size={13} />}
              </div>
              <span style={{
                fontSize: 9, fontWeight: 700, letterSpacing: .5, textTransform: 'uppercase',
                color: col, whiteSpace: 'nowrap',
              }}>
                {s.label}
              </span>
            </div>
            {!isLast && (
              <div style={{
                flex: 1, height: 1.5, marginTop: 14, marginLeft: 6, marginRight: 6,
                background: done ? C.green : 'var(--c-divider)',
                transition: 'background .35s ease',
              }} />
            )}
          </div>
        );
      })}
    </div>
  );
}

export default function AddSchoolPage() {
  const navigate = useNavigate();
  useCustomFormFamilies();
  const [step,    setStep]    = useState(0);
  const [dir,     setDir]     = useState('forward'); // drives step-transition slide direction
  const [school,  setSchool]  = useState(EMPTY_SCHOOL);
  const [codeTouched, setCodeTouched] = useState(false);
  const [saving,  setSaving]  = useState(false);
  const [err,     setErr]     = useState(null);
  const [success, setSuccess] = useState(null);
  const [codeJustFilled, setCodeJustFilled] = useState(false); // brief highlight when auto-suggested

  // Auto-suggest the code from the full name as it's typed — stops as soon as
  // the admin edits the code field directly.
  useEffect(() => {
    if (codeTouched) return;
    const suggestion = suggestSchoolCode(school.full_name);
    setSchool(p => {
      if (p.code === suggestion) return p;
      setCodeJustFilled(true);
      return { ...p, code: suggestion };
    });
  }, [school.full_name, codeTouched]);

  useEffect(() => {
    if (!codeJustFilled) return;
    const t = setTimeout(() => setCodeJustFilled(false), 450);
    return () => clearTimeout(t);
  }, [codeJustFilled]);

  const set = (k, v) => setSchool(p => ({ ...p, [k]: v }));

  function setToggle(key, requiresKey, on) {
    let chain = [...school.approval_chain];
    if (on && !chain.includes(requiresKey)) {
      const vcIdx = chain.findIndex(k => SCHOOL_CHAIN_MAP[k]?.locked);
      chain.splice(vcIdx === -1 ? chain.length : vcIdx, 0, requiresKey);
    } else if (!on) {
      chain = chain.filter(k => k !== requiresKey);
    }
    setSchool(p => ({ ...p, [key]: on, approval_chain: chain }));
  }

  function validate() {
    if (step === 0) {
      if (!school.full_name.trim()) return 'Full name is required.';
      if (!school.code.trim())      return 'School code is required.';
    }
    return null;
  }

  function handleNext() {
    const msg = validate();
    if (msg) { setErr(msg); return; }
    setErr(null);
    if (step < STEPS.length - 1) { setDir('forward'); setStep(s => s + 1); return; }
    handleSave();
  }

  async function handleSave() {
    setErr(null); setSaving(true);
    try {
      const formKey = selectedSchoolFormKey(school);
      await api.schools.create({
        ...school,
        ...schoolFormPayload(formKey),
      });
      cacheSchoolFormSelection(school.code, formKey);
      setSuccess(school.code);
      setSchool(EMPTY_SCHOOL);
      setCodeTouched(false);
      setDir('forward');
      setStep(0);
    } catch (e) {
      setErr(e.message);
    } finally {
      setSaving(false);
    }
  }

  const trackMeta = SCHOOL_TRACKS.find(t => t.value === school.track);
  const formMeta  = getAllSchoolForms().find(f => f.key === selectedSchoolFormKey(school));
  const isCisr = school.track === 'cisr';

  const chainSteps = school.approval_chain.map(k => ({
    key: k,
    label: k === 'dean' ? deanLabelForTrack(school.track) : SCHOOL_CHAIN_MAP[k]?.label ?? k,
    color: SCHOOL_CHAIN_MAP[k]?.color ?? C.accent,
    icon: SCHOOL_CHAIN_MAP[k]?.icon ?? I.star,
  }));

  function handleTrackChange(track) {
    if (track === 'cisr') {
      setSchool(p => ({
        ...p,
        track,
        has_hod: false,
        has_director: false,
        approval_chain: defaultChainFor(false, false, track),
      }));
      return;
    }
    setSchool(p => ({
      ...p,
      track,
      approval_chain: defaultChainFor(p.has_hod, p.has_director, track),
    }));
  }

  // ── Step renderers ────────────────────────────────────────────────────────
  const stepIdentity = () => (
    <div>
      <SL icon={I.bldg} color="#3b82f6">School Identity</SL>
      <div style={{ marginBottom: 16 }}>
        <label style={lbl}>Full Name *</label>
        <input
          className="ifield" style={inp} placeholder="e.g. School of Design"
          value={school.full_name} autoFocus
          autoComplete="off" name="new-school-full-name"
          onChange={e => set('full_name', e.target.value)}
        />
      </div>
      <div style={{ marginBottom: 4 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 5 }}>
          <label style={{ ...lbl, marginBottom: 0 }}>Code *</label>
          {!codeTouched ? (
            <span style={{
              fontSize: 8.5, fontWeight: 800, letterSpacing: .5, textTransform: 'uppercase',
              color: C.accent, background: `${C.accent}14`, border: `1px solid ${C.accent}30`,
              borderRadius: 20, padding: '1px 7px', display: 'inline-flex', alignItems: 'center', gap: 4,
            }}>
              <I.refresh size={8} /> Auto
            </span>
          ) : (
            <button
              type="button"
              onClick={() => setCodeTouched(false)}
              style={{ fontSize: 9.5, color: C.accent, background: 'none', border: 'none', cursor: 'pointer', fontWeight: 600, padding: 0 }}
            >
              ↺ Reset to auto
            </button>
          )}
        </div>
        <input
          className="ifield"
          style={{
            ...inp, fontFamily: "'JetBrains Mono',monospace",
            background: codeJustFilled ? `${C.accent}14` : inp.background,
            borderColor: codeJustFilled ? `${C.accent}80` : undefined,
            transition: 'background .35s ease, border-color .35s ease',
          }}
          placeholder="e.g. SoD"
          value={school.code}
          autoComplete="off" name="new-school-code"
          onChange={e => { set('code', e.target.value.toUpperCase()); setCodeTouched(true); }}
        />
        <div style={{ fontSize: 10, color: C.muted, marginTop: 5, transition: 'opacity .2s ease' }}>
          {codeTouched ? "You've set this manually." : 'Suggested automatically from the name — edit any time.'}
        </div>
      </div>

      <div style={{ marginTop: 18 }}>
        <SL icon={I.world} color="#818cf8">School / Center Type</SL>
        <TrackPicker value={school.track} onChange={handleTrackChange} />
      </div>
    </div>
  );

  const stepStructure = () => (
    <div>
      <SL icon={I.layers} color="#a78bfa" sub="Faculty in this school pass through these layers before the Dean">
        Organisational Layers
      </SL>
      {isCisr ? (
        <div style={{
          padding: '11px 14px', borderRadius: 11, marginBottom: 20,
          background: 'rgba(251,146,60,.07)', border: '1px solid rgba(251,146,60,.22)',
          color: C.subtle, fontSize: 12, lineHeight: 1.5,
        }}>
          CISR / Center entries use Center Head followed by VC. HOD and Director layers are not used.
        </div>
      ) : (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 20 }}>
        <ToggleRow
          icon={I.users} color="#a78bfa"
          label="Has HOD"
          sub="Faculty report to a Head of Department first."
          checked={school.has_hod}
          onChange={v => setToggle('has_hod', 'hod', v)}
        />
        <ToggleRow
          icon={I.key} color="#fbbf24"
          label="Has Director"
          sub="A school Director reviews before the Dean. Off = straight to Dean."
          checked={school.has_director}
          onChange={v => setToggle('has_director', 'director', v)}
        />
      </div>
      )}

      <SL icon={I.list} color="#22d3ee" sub="Optional — used for faculty department assignment">
        Departments
      </SL>
      <DepartmentEditor departments={school.departments} onChange={d => set('departments', d)} />
    </div>
  );

  const stepChain = () => (
    <div>
      <SL icon={I.workflow} color="#34d399" sub="Reorder or remove any step — VC always signs off last">
        Approval Chain
      </SL>
      <ChainBuilder
        chain={school.approval_chain}
        onChange={c => set('approval_chain', c)}
        track={school.track}
        hasHod={school.has_hod}
        hasDirector={school.has_director}
        onToggleOff={flag => set(flag, false)}
      />
    </div>
  );

  const stepForm = () => (
    <div>
      <SL icon={I.doc} color="#f472b6" sub="Which appraisal form faculty in this school fill out">
        Appraisal Form
      </SL>
      <div style={{ marginBottom: 20 }}>
        <FormPicker
          value={selectedSchoolFormKey(school)}
          onChange={f => setSchool(p => ({ ...p, ...schoolFormPayload(f) }))}
        />
      </div>
      <SL icon={I.check} color="#34d399">Status</SL>
      <ToggleRow
        icon={I.check} color="#34d399"
        label="Active"
        sub="Inactive schools are hidden from the school picker when adding faculty."
        checked={school.active}
        onChange={v => set('active', v)}
      />
    </div>
  );

  const RENDERERS = [stepIdentity, stepStructure, stepChain, stepForm];

  return (
    <div className="page-enter" style={{ overflow: 'hidden' }}>
      <PageHead
        title="Add School"
        sub="Define a new school in a few quick steps"
        action={
          <button
            onClick={() => navigate('/schools')}
            style={{
              display: 'flex', alignItems: 'center', gap: 6,
              padding: '7px 14px', borderRadius: 8, fontSize: 13, fontWeight: 600,
              cursor: 'pointer', color: C.subtle,
              background: 'var(--c-soft-bg)', border: '1px solid var(--c-btn-border)',
            }}
          >
            <I.list size={12} /> All Schools
          </button>
        }
      />

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 300px', gap: 16, alignItems: 'start' }}>

        <Card delay={0}>
          <Stepper current={step} />

          <div style={{ marginBottom: 22 }}>
            <div style={{ fontSize: 17, fontWeight: 700, color: C.text }}>{STEPS[step].label}</div>
            <div style={{ fontSize: 12, color: C.muted, marginTop: 2 }}>{STEPS[step].sub}</div>
          </div>

          <div key={step} style={{ animation: `${dir === 'forward' ? 'slideInRight' : 'slideInLeft'} .26s cubic-bezier(.22,1,.36,1) both` }}>
            {RENDERERS[step]()}
          </div>

          {err && (
            <div style={{
              marginTop: 16, padding: '10px 14px', borderRadius: 8, fontSize: 13,
              color: C.red, background: 'rgba(248,113,113,.08)', border: '1px solid rgba(248,113,113,.2)',
              display: 'flex', alignItems: 'center', gap: 8,
            }}>
              <I.bug size={14} style={{ flexShrink: 0 }} />
              {err}
            </div>
          )}

          {success && (
            <div style={{
              marginTop: 16, padding: '12px 14px', borderRadius: 8, fontSize: 13,
              color: C.green, background: 'rgba(52,211,153,.08)', border: '1px solid rgba(52,211,153,.2)',
              display: 'flex', alignItems: 'center', gap: 8,
            }}>
              <I.check size={15} style={{ flexShrink: 0 }} />
              School <strong>{success}</strong> created. You can add another.
            </div>
          )}

          <div style={{
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            marginTop: 24, paddingTop: 18, borderTop: '1px solid var(--c-divider)',
          }}>
            <div>
              {step > 0 && (
                <button className="act-btn" style={oBtn} onClick={() => { setErr(null); setDir('backward'); setStep(s => s - 1); }}>
                  ← Back
                </button>
              )}
            </div>
            <div style={{ display: 'flex', gap: 10 }}>
              <button className="act-btn" style={{ ...oBtn, fontSize: 12 }} onClick={() => navigate('/schools')}>
                Cancel
              </button>
              <button className="act-btn" style={pBtn} onClick={handleNext} disabled={saving}>
                {saving ? 'Creating…' : step === STEPS.length - 1 ? 'Create School' : 'Continue →'}
              </button>
            </div>
          </div>
        </Card>

        {/* Right panel */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <Card title="Summary" delay={60}>
            {[
              { k: 'Code',   v: school.code || null, mono: true },
              { k: 'Name',   v: school.full_name || null },
              { k: 'Type',   v: trackMeta?.label },
              { k: 'HOD',    v: school.has_hod ? 'Yes' : 'No' },
              { k: 'Director', v: school.has_director ? 'Yes' : 'No' },
              { k: 'Departments', v: school.departments.length ? `${school.departments.length} added` : 'None' },
              { k: 'Form',   v: formMeta?.label },
              { k: 'Status', v: school.active ? 'Active' : 'Inactive' },
            ].filter(r => r.v).map((r, i, arr) => (
              <div key={r.k} style={{
                display: 'flex', justifyContent: 'space-between', gap: 8, padding: '6px 0',
                borderBottom: i < arr.length - 1 ? '1px solid var(--c-divider)' : 'none',
              }}>
                <span style={{ fontSize: 11, color: C.muted }}>{r.k}</span>
                <span style={{ fontSize: 11, color: C.subtle, textAlign: 'right', fontFamily: r.mono ? "'JetBrains Mono',monospace" : 'inherit' }}>{r.v}</span>
              </div>
            ))}
          </Card>

          <Card
            title="Appraisal Journey"
            sub={`Faculty → ${chainSteps.map(s => s.label).join(' → ')}`}
            delay={100}
          >
            <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
              {[{ key: 'faculty', label: 'Faculty', color: C.accent, icon: I.users }, ...chainSteps].map((s, i, arr) => {
                const StepIcon = s.icon;
                return (
                  <div key={s.key + i} style={{ display: 'flex', gap: 11 }}>
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: 24, flexShrink: 0 }}>
                      <div style={{
                        width: 22, height: 22, borderRadius: '50%', flexShrink: 0,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        background: `${s.color}18`, border: `1.5px solid ${s.color}40`, color: s.color,
                      }}>
                        <StepIcon size={10} />
                      </div>
                      {i < arr.length - 1 && (
                        <div style={{ width: 1.5, flex: 1, background: 'var(--c-divider)', marginTop: 3, minHeight: 14 }} />
                      )}
                    </div>
                    <div style={{ fontSize: 11.5, fontWeight: 700, color: i === 0 ? C.accent : s.color, paddingBottom: i < arr.length - 1 ? 10 : 0, paddingTop: 1 }}>
                      {s.label}
                    </div>
                  </div>
                );
              })}
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}

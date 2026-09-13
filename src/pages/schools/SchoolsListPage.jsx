import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { C } from '../../constants/colors';
import { api } from '../../api/client';
import Card from '../../components/Card';
import PageHead from '../../components/PageHead';
import Modal from '../../components/Modal';
import Badge from '../../components/Badge';
import StatCard from '../../components/StatCard';
import { I } from '../../components/icons';
import { pBtn, oBtn } from '../../constants/styleTokens';
import { useFetch } from '../../hooks/useFetch';
import SchoolForm from '../../components/schools/SchoolForm';
import { SCHOOL_CHAIN_MAP, SCHOOL_TRACKS, deanLabelForTrack, selectedSchoolFormKey, schoolFormPayload, schoolFormLabel, cacheSchoolFormSelection, hydrateSchoolFormSelection } from '../../constants/schoolRoles';
import { SCHOOLS as LEGACY_SCHOOLS } from '../../constants/schools';
import { useCustomFormFamilies } from '../../utils/backendFormFamilies';

function Alert({ msg, color = C.red }) {
  if (!msg) return null;
  return (
    <div style={{
      padding: '9px 13px', borderRadius: 8, marginBottom: 14,
      background: `${color}0d`, border: `1px solid ${color}30`, fontSize: 12, color,
      display: 'flex', alignItems: 'center', gap: 8,
    }}>
      <I.bug size={13} style={{ flexShrink: 0 }} />
      {msg}
    </div>
  );
}

function chainLabelsFor(school) {
  if (school.code === 'CISR' || school.track === 'cisr') {
    return [
      { key: 'center_head', label: 'Center Head', color: '#fb923c', icon: I.layers },
      { key: 'vc', label: 'VC', color: '#f472b6', icon: I.shield },
    ];
  }
  const chain = school.approval_chain?.length ? school.approval_chain : ['dean', 'vc'];
  return chain.map(k => ({
    key: k,
    label: k === 'dean' ? deanLabelForTrack(school.track) : SCHOOL_CHAIN_MAP[k]?.label ?? k,
    color: SCHOOL_CHAIN_MAP[k]?.color ?? C.accent,
    icon: SCHOOL_CHAIN_MAP[k]?.icon ?? I.star,
  }));
}

// Small inline flow — Faculty → step → step → … used on both list and legacy cards
function MiniFlow({ nodes }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 4, marginTop: 12 }}>
      {nodes.map((n, i, arr) => (
        <div key={n.label + i} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <div style={{
            display: 'inline-flex', alignItems: 'center', gap: 5,
            padding: '4px 9px 4px 6px', borderRadius: 20,
            background: `${n.color}12`, border: `1px solid ${n.color}2c`,
          }}>
            {n.icon && (
              <div style={{ width: 15, height: 15, borderRadius: '50%', flexShrink: 0, background: `${n.color}22`, display: 'flex', alignItems: 'center', justifyContent: 'center', color: n.color }}>
                <n.icon size={8.5} />
              </div>
            )}
            <span style={{ fontSize: 10.5, fontWeight: 700, color: n.color }}>{n.label}</span>
          </div>
          {i < arr.length - 1 && (
            <svg width="12" height="8" viewBox="0 0 16 10" style={{ flexShrink: 0 }}>
              <path d="M1 5h10M8 2l4 3-4 3" fill="none" stroke="rgba(148,163,184,.45)" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          )}
        </div>
      ))}
    </div>
  );
}

function formatDeleteImpact(impact) {
  if (!impact || typeof impact !== 'object') return '';
  const ignored = new Set(['school', 'school_code', 'can_safe_delete', 'warnings']);
  const rows = Object.entries(impact)
    .filter(([key, value]) => !ignored.has(key) && typeof value === 'number' && value > 0)
    .map(([key, value]) => `${key.replace(/_/g, ' ')}: ${value}`);
  const warnings = Array.isArray(impact.warnings) ? impact.warnings : [];
  return [...rows, ...warnings].join('\n');
}

// ── Edit modal ────────────────────────────────────────────────────────────────
function EditSchoolModal({ school, onClose, onSaved }) {
  const [value,  setValue]  = useState({
    ...school,
    approval_chain: school.approval_chain?.length ? school.approval_chain : ['dean', 'vc'],
    departments: school.departments || [],
  });
  const [saving, setSaving] = useState(false);
  const [err,    setErr]    = useState('');

  async function handleSave() {
    if (!value.full_name.trim()) { setErr('Full name is required.'); return; }
    setSaving(true); setErr('');
    try {
      const formKey = selectedSchoolFormKey(value);
      await api.schools.update(school.code, {
        ...value,
        ...schoolFormPayload(formKey),
      });
      cacheSchoolFormSelection(school.code, formKey);
      onSaved();
    } catch (e) {
      setErr(e.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal maxWidth={640} onClose={onClose}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
        <div style={{
          width: 38, height: 38, borderRadius: 10, flexShrink: 0,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: `${C.accent}18`, border: `1px solid ${C.accent}30`, color: C.accent,
        }}>
          <I.edit size={16} />
        </div>
        <div>
          <div style={{ fontSize: 16, fontWeight: 700, color: C.text }}>Edit School</div>
          <div style={{ fontSize: 12, color: C.muted, marginTop: 2 }}>
            <strong style={{ color: C.subtle, fontFamily: "'JetBrains Mono',monospace" }}>{school.code}</strong> — {school.full_name}
          </div>
        </div>
      </div>

      <Alert msg={err} />

      <div style={{ maxHeight: '58vh', overflowY: 'auto', paddingRight: 6 }}>
        <SchoolForm value={value} onChange={setValue} isEdit />
      </div>

      <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 20, paddingTop: 16, borderTop: '1px solid var(--c-divider)' }}>
        <button className="act-btn" style={oBtn} onClick={onClose}>Cancel</button>
        <button className="act-btn" style={{ ...pBtn, opacity: saving ? .6 : 1 }} disabled={saving} onClick={handleSave}>
          <I.check size={14} />
          {saving ? 'Saving…' : 'Save Changes'}
        </button>
      </div>
    </Modal>
  );
}

// ── School row card ───────────────────────────────────────────────────────────
function SchoolCard({ school, onRefresh, onDelete, isDeleting }) {
  const [editing, setEditing] = useState(false);
  const trackMeta = school.track === 'cisr'
    ? { value: 'cisr', label: 'Center', icon: I.layers, color: '#fb923c' }
    : (SCHOOL_TRACKS.find(t => t.value === school.track) ?? SCHOOL_TRACKS[0]);
  const TrackIcon = trackMeta.icon;
  const inactive = school.active === false;
  const nodes = [
    { label: 'Faculty', color: C.accent, icon: I.users },
    ...chainLabelsFor(school),
  ];

  return (
    <div className="glass glass-glow card-shimmer" style={{
      borderRadius: 14, padding: '17px 19px',
      border: `1.5px solid ${inactive ? 'var(--c-border)' : `${trackMeta.color}22`}`,
      opacity: inactive ? .6 : 1,
      position: 'relative', overflow: 'hidden',
    }}>
      {editing && (
        <EditSchoolModal
          school={school}
          onClose={() => setEditing(false)}
          onSaved={() => { setEditing(false); onRefresh(); }}
        />
      )}

      {/* top accent */}
      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 2, background: `linear-gradient(90deg,transparent,${trackMeta.color}80,transparent)` }} />

      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0 }}>
          <div style={{
            width: 42, height: 42, borderRadius: 11, flexShrink: 0,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: `${trackMeta.color}16`, border: `1px solid ${trackMeta.color}30`, color: trackMeta.color,
          }}>
            <TrackIcon size={18} />
          </div>
          <div style={{ minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <span style={{ fontFamily: "'JetBrains Mono',monospace", fontWeight: 700, fontSize: 13, color: trackMeta.color }}>
                {school.code}
              </span>
              <span style={{ fontSize: 13.5, color: C.text, fontWeight: 700 }}>{school.full_name}</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 6, flexWrap: 'wrap' }}>
              <Badge color={school.track === 'engineering' ? 'blue' : school.track === 'cisr' ? 'orange' : 'green'}>{trackMeta.label}</Badge>
              {school.has_hod && <Badge color="purple">Has HOD</Badge>}
              {!school.has_director && <Badge color="yellow">No Director</Badge>}
              <Badge color={selectedSchoolFormKey(school) === 'standard' ? 'blue' : 'purple'}>{schoolFormLabel(school)}</Badge>
              {inactive && <Badge color="gray">Inactive</Badge>}
              {school.departments?.length > 0 && (
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 10.5, color: C.muted }}>
                  <I.list size={10} /> {school.departments.length} dept{school.departments.length > 1 ? 's' : ''}
                </span>
              )}
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', gap: 7, flexShrink: 0 }}>
          <button className="act-btn" onClick={() => setEditing(true)} style={{ ...oBtn, padding: '6px 13px', fontSize: 11.5, gap: 5 }}>
            <I.edit size={11} /> Edit
          </button>
          <button
            className="act-btn"
            onClick={() => onDelete(school)} disabled={isDeleting}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '6px 13px', borderRadius: 7, border: 'none', cursor: 'pointer', background: 'rgba(248,113,113,.08)', color: C.red, fontSize: 11.5, fontWeight: 600, opacity: isDeleting ? .5 : 1, transition: 'background .15s ease' }}
          >
            <I.trash size={11} /> {isDeleting ? '…' : 'Delete'}
          </button>
        </div>
      </div>

      <MiniFlow nodes={nodes} />
    </div>
  );
}

// ── Legacy (hardcoded) schools — shown read-only until the backend is live ────
function LegacyPreview() {
  return (
    <Card
      title="Current Schools (built-in list)"
      sub="Read-only — hardcoded until the Schools API is deployed"
      info="These 10 schools live in src/constants/schools.js today. Once /admin/schools is deployed and the migration runs, they become fully editable rows here."
      delay={80}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {LEGACY_SCHOOLS.map(s => {
          const isEng = s.dean === 'engineering';
          const isCenter = s.dean === 'cisr';
          const color = isEng ? '#3b82f6' : isCenter ? '#fb923c' : '#34d399';
          const TrackIcon = isCenter ? I.layers : isEng ? I.bldg : I.school;
          return (
            <div key={s.code} style={{
              display: 'flex', alignItems: 'center', gap: 11, padding: '9px 12px',
              borderRadius: 10, background: 'var(--c-soft-bg)', border: '1px solid var(--c-border)',
            }}>
              <div style={{
                width: 28, height: 28, borderRadius: 8, flexShrink: 0,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                background: `${color}18`, border: `1px solid ${color}30`, color,
              }}>
                <TrackIcon size={13} />
              </div>
              <span style={{ fontFamily: "'JetBrains Mono',monospace", fontWeight: 700, fontSize: 12, color, minWidth: 58 }}>
                {s.code}
              </span>
              <span style={{ flex: 1, fontSize: 12, color: C.subtle, minWidth: 0 }}>{s.full}</span>
              <Badge color={isEng ? 'blue' : isCenter ? 'orange' : 'green'}>
                {isEng ? 'Engineering' : isCenter ? 'Center' : 'Non-Engineering'}
              </Badge>
              {s.hod && <Badge color="purple">Has HOD</Badge>}
            </div>
          );
        })}
      </div>
    </Card>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function SchoolsListPage() {
  const navigate = useNavigate();
  useCustomFormFamilies();
  const [rev,        setRev]        = useState(0);
  const [deletingId,  setDeletingId]  = useState(null);
  const [deleteError, setDeleteError] = useState('');
  const [removedCodes, setRemovedCodes] = useState(() => new Set());

  const { data, loading, error: fetchErr } = useFetch(() => api.schools.list(), [rev]);
  const rows = Array.isArray(data)
    ? data.map(hydrateSchoolFormSelection).filter(s => !removedCodes.has(s.code))
    : [];
  const notDeployed = fetchErr && (fetchErr.includes('404') || fetchErr.includes('Not Found') || fetchErr.includes('500'));

  const total    = rows.length;
  const engCount = rows.filter(s => s.track === 'engineering').length;
  const nonCount = rows.filter(s => s.track === 'non_engineering').length;
  const activeCt = rows.filter(s => s.active !== false).length;

  async function handleDelete(school) {
    setDeleteError('');
    if (!window.confirm(`Delete "${school.code} — ${school.full_name}"?\n\nThis cannot be undone.`)) return;
    setDeletingId(school.code);
    try {
      await api.schools.remove(school.code);
      setRemovedCodes(prev => new Set(prev).add(school.code));
      setRev(r => r + 1);
    } catch (e) {
      try {
        const impact = await api.schools.deleteImpact(school.code);
        const detail = formatDeleteImpact(impact) || e.message;
        const proceed = window.confirm(
          `Safe delete is blocked for "${school.code}".\n\n${detail}\n\nForce delete will remove/deactivate linked accounts, role assignments, and school data for this school only.\n\nContinue with force delete?`
        );
        if (!proceed) {
          setDeleteError(e.message);
          return;
        }
        const typed = window.prompt(`Type ${school.code} to permanently force delete this school and its linked data.`);
        if (typed !== school.code) {
          setDeleteError('Force delete cancelled. School code confirmation did not match.');
          return;
        }
        await api.schools.forceRemove(school.code);
        setRemovedCodes(prev => new Set(prev).add(school.code));
        setRev(r => r + 1);
      } catch (forceErr) {
        setDeleteError(forceErr.message || e.message);
      }
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <div className="page-enter">
      <PageHead
        title="Schools"
        sub="Manage every school — its track, organisational layers, and approval chain"
        action={
          <button className="act-btn" style={pBtn} onClick={() => navigate('/schools/add')}>
            <I.addUser size={14} />
            Add School
          </button>
        }
      />

      {!notDeployed && !loading && rows.length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14, marginBottom: 18 }}>
          <StatCard key={`total-${total}`}    label="Total Schools"    value={total}    color={C.accent} IconC={I.bldg}   delay={0}  />
          <StatCard key={`eng-${engCount}`}   label="Engineering"      value={engCount} color="#3b82f6"  IconC={I.bldg}   delay={40} />
          <StatCard key={`non-${nonCount}`}   label="Non-Engineering"  value={nonCount} color="#34d399"  IconC={I.school} delay={80} />
          <StatCard key={`active-${activeCt}`} label="Active"          value={activeCt} color="#22d3ee" IconC={I.check}  delay={120}/>
        </div>
      )}

      {notDeployed ? (
        <>
          <Card title="All Schools" delay={0}>
            <div style={{ padding: '24px 0', textAlign: 'center', color: C.muted, fontSize: 12, lineHeight: 1.8 }}>
              <div style={{
                width: 52, height: 52, borderRadius: 14, margin: '0 auto 14px',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                background: `${C.yellow}14`, border: `1px solid ${C.yellow}30`, color: C.yellow,
              }}>
                <I.gear size={22} />
              </div>
              <div style={{ fontWeight: 700, color: C.subtle, marginBottom: 4, fontSize: 13 }}>Backend endpoint not deployed yet</div>
              <div>
                Deploy <code style={{ background: 'var(--c-soft-bg)', padding: '1px 5px', borderRadius: 4 }}>GET /admin/schools</code> first.
              </div>
              <div style={{ marginTop: 6 }}>See <strong>Docs/Schools.md</strong> for the endpoint spec.</div>
            </div>
          </Card>
          <div style={{ marginTop: 14 }}>
            <LegacyPreview />
          </div>
        </>
      ) : loading ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {[0, 1, 2].map(i => <div key={i} className="skeleton" style={{ height: 100, borderRadius: 14, animationDelay: `${i * 70}ms` }} />)}
        </div>
      ) : (
        <>
          <Alert msg={deleteError} />
          {rows.length === 0 ? (
            <Card title="No Schools Yet" delay={0}>
              <div style={{ textAlign: 'center', padding: '28px 0', color: C.muted, fontSize: 12 }}>
                <div style={{
                  width: 48, height: 48, borderRadius: 14, margin: '0 auto 12px',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  background: `${C.accent}12`, border: `1px solid ${C.accent}28`, color: C.accent,
                }}>
                  <I.bldg size={20} />
                </div>
                Add your first school to get started.
              </div>
            </Card>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {rows.map((school, i) => (
                <div key={school.code} className="row-enter" style={{ animationDelay: `${i * 50}ms` }}>
                  <SchoolCard
                    school={school}
                    onRefresh={() => setRev(r => r + 1)}
                    onDelete={handleDelete}
                    isDeleting={deletingId === school.code}
                  />
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}

# Form Builder — Admin ⇄ Backend ⇄ Faculty schema pipeline

**Status (verified by reading the actual backend source at
`A:\Frontend DYPIU Final\Appraisal Form 2.0\FA2.0(AKP)\Faculty_appraisal`, not assumed):**
the backend side of this is **built and real** — the Admin UI's Dynamic Form builder is
genuinely talking to a live `/api/v1/admin/form-schema` API, not a prototype. What's still
missing is narrower than it used to be: one backend endpoint, one server-side validation rule,
one school-assignment integration, and — the big one — **the faculty-facing rendering engine
doesn't exist yet, in a different repo**. See §2 for the precise remaining list and §3 for a
ready-to-use prompt for that last piece.

**Owner of this doc:** Admin UI. **Action needed from:** backend dev (small items in §2),
then appraisal-frontend dev (the rendering engine, §3).

---

## 1. What's actually implemented (confirmed by reading the code, not the old plan)

### 1.1 Data model — `src/models/core.py`

```python
class FormSectionDefinition(Base):
    __tablename__ = "form_section_definitions"
    code            = Column(String, primary_key=True)
    form_family     = Column(String, nullable=False)
    part            = Column(String, nullable=False)      # free text, not an enum
    section_key     = Column(String, nullable=False)
    title           = Column(String, nullable=False)
    max_marks       = Column(Numeric, nullable=False, default=0)
    storage_table   = Column(String, nullable=True)        # NULL = custom section
    fields          = Column(JSONB, nullable=False, default=list)
    active          = Column(Boolean, nullable=False, default=True)
    order           = Column(Integer, nullable=False, default=0)
    table_order     = Column(JSONB, nullable=False, default=list)

class CustomSectionRow(Base):
    __tablename__ = "custom_section_rows"
    id, faculty_email, academic_year, form_family, section_code, section_title,
    row_no, score, hod_score, director_score, dean_score, vc_score,
    custom_fields = Column(JSONB, nullable=False, default=dict)
```

Every physical Part A/B table (`TeachingProcess`, `CourseFile`, `JournalPublication`, `Patent`,
… all ~26 of them in `src/models/part_a.py` / `part_b.py`) inherits `custom_fields = Column(JSONB
...)` from `BasePartAModel` / `BasePartBModel`. This is exactly the §2 design from the original
plan — core fields stay real typed SQL columns, admin-added fields go through the jsonb
side-channel — and it's done for every table, not a subset.

### 1.2 Admin endpoints — `src/api/v1/admin.py:3442-3739`

All five exist and are gated by real server-side role checks:

```python
def _check_admin(current_user):
    if not any(r in current_user.roles for r in ("admin", "super_admin")):
        raise HTTPException(status_code=403, detail="Admin role required")
```

| Method | Path | Behavior |
|---|---|---|
| GET | `/admin/form-schema?form_family=&part=` | lists sections, optional filters, ordered by part/order/code |
| POST | `/admin/form-schema` | creates a section; always `storage_table=NULL` (custom) |
| PUT | `/admin/form-schema/{code}` | updates title/part/max_marks/active/order/table_order |
| PUT | `/admin/form-schema/{code}/fields` | replaces the field array, with key-locking (§1.3) |
| DELETE | `/admin/form-schema/{code}` | delete if custom, **retire** (`active=False`) if core |

Every response is dual-cased (`max_marks`/`maxMarks`, `table_order`/`tableOrder`) so either
casing works from the client — this is why `src/utils/backendFormSchemas.js` in Admin UI doesn't
need a translation layer.

### 1.3 Field key-locking and core-field preservation — `src/setup/form_schema_utils.py`

`validate_and_normalize_fields()` (called from the `/fields` PUT with `strict=True`) does exactly
what the original spec asked for, verified by reading the function body:

- A field's `key` is derived once (`slugify_key(label)` if none supplied) and then **locked** —
  if an incoming payload's `key` differs from the already-saved key for that field, it raises
  `400`.
- If a core field (`isCustom: False`) is missing from the submitted array, it isn't dropped — the
  function re-adds it with `active: False`, i.e. retired, not deleted.
- Duplicate keys within one section are rejected (`strict=True`) or de-duplicated with a numeric
  suffix (`strict=False`, used for read paths).
- Column `maxMarks` is normalized per-column: non-numeric types force it to `null`; numeric types
  accept a finite, non-negative number; legacy garbage values are tolerated (`strict=False`) or
  rejected (`strict=True`) depending on call site.

### 1.4 Faculty-facing read path — `src/api/v1/appraisal.py:129-170`

```
GET /api/v1/appraisal/form-schema?form_family=&academic_year=
```

This **exists and is filtered server-side** via `filter_active_form_schema()` — only
`active: True` sections, only `active: True` fields within them, ordered by `table_order` then
part/order. It resolves `form_family` from the caller's school when not explicit, and expands
family groups (e.g. `standard` also pulls `all_teaching` + `standard_design`). This is the read
path the faculty-facing renderer should call — see §3.

### 1.5 Submission pipeline already routes core vs. custom vs. brand-new sections

`src/api/v1/appraisal.py` (~line 560-660, the `shred_form`-style handler) already:

- Writes core fields to their real SQL column, admin-added fields into that row's `custom_fields`
  jsonb (`db_item.custom_fields = custom_f`).
- For sections with `storage_table IS NULL` (fully custom, admin-created from scratch), deletes
  and rewrites `CustomSectionRow` rows keyed by `faculty_email` + `academic_year` +
  `section_code`, splitting the reviewer score columns (`score`/`hod_score`/`director_score`/
  `dean_score`/`vc_score`) out of the free-form `custom_fields` blob.

**This means the backend can already accept and score a brand-new admin-created section** — the
missing piece is that nothing on the faculty-facing side sends data shaped that way yet (§3).

---

## 2. What's still actually missing (in priority order)

### 2.1 (Biggest gap, different repo) No schema-driven rendering engine on the faculty side

Confirmed by reading `Appraisal-form-2.0`'s `src/features/faculty-appraisal/forms/`: forms are
still 100% hand-coded (`StandardMyAppraisal.jsx`, `CreativeSchoolAppraisalForm.jsx`, plus the
separate `src/components/appraisal/PartA-D/*.jsx` reviewer views). Nothing there calls
`GET /appraisal/form-schema`. An admin can edit a schema all day in Admin UI and it changes
what's *stored*, but faculty still see the old hardcoded form. This is the actual blocker to "it
perfectly works end to end" — see §3 for the handoff prompt to close it.

### 2.2 Custom/published families in the school form registry — RESOLVED, implemented differently than first proposed

Originally reproduced live as `400 Invalid default_form 'custom'. Must be 'standard' or 'creative'.`
This is now fixed on the backend — but implemented with a different, and better, design than what
this doc originally proposed, so the note below is corrected to match what's actually there
(re-read `src/setup/form_registry.py` in full before touching this again — it was substantially
rewritten).

**Actual implemented design:** there is no `"custom"` sentinel value. For any `default_form` that
isn't `"standard"` or `"creative"`, the backend treats **`default_form` itself as the family
name** and validates it against real `form_section_definitions.form_family` values (queried live
via `get_dynamic_form_registry()`, `src/setup/form_registry.py:87-104`). A dynamic registry entry
for a family sets `default_form`, `form_variant`, **and** `form_type` (`FORM_<FAMILY>`, not
`CUSTOM_<FAMILY>`) all consistently:

```python
dynamic_entry = {
    "default_form": fam_clean,
    "form_variant": fam_clean,
    "form_type": f"FORM_{fam_clean.upper().replace('-', '_')}",
    "form_label": f"{fam_clean.replace('_', ' ').replace('-', ' ').title()} Appraisal",
    "active": True,
    "is_system": False,
}
```

So the correct client payload to assign a custom family to a school is
`{ default_form: <family>, form_variant: <family>, form_type: "FORM_<FAMILY>" }` — **not**
`{ default_form: "custom", form_variant: <family> }`. Sending the latter 400s, because `"custom"`
itself is never a real `form_family` value, so it fails the "is this a real, active family" check
(`validate_and_resolve_form_config`, `src/setup/form_registry.py:146-280`) regardless of what
`form_variant` says.

**Admin UI was fixed to match this** (was sending the wrong shape) —
`src/utils/backendFormFamilies.js`'s `buildFamilyList()` now sets `defaultForm: family` and
`formType: \`FORM_${family.toUpperCase().replace(/-/g, '_')}\`` instead of the literal `'custom'` /
`CUSTOM_` prefix it used before. If you're reading this from a different client integrating
against this API, match the shape above, not the literal string `"custom"`.

The active/`storage_table`-null family-discovery logic Admin UI relies on
(`src/utils/backendFormFamilies.js` — only list a family once it has ≥1 active section and every
section is fully custom) still applies unchanged; only the payload shape sent on save changed.

`src/api/v1/admin.py` — `_validate_school_payload` needs to become `async` and thread `db`
through, since the new branch needs a query:

```python
async def _validate_school_payload(..., existing_school=None, db: AsyncSession = None) -> dict:
    ...
    return await validate_and_resolve_form_config(..., db=db)
```

And both call sites need `await` + `db=db` added:

```python
resolved_form = await _validate_school_payload(
    code=code, full_name=full_name, track=track, has_hod=data.has_hod,
    has_director=data.has_director, approval_chain=data.approval_chain,
    default_form=raw_default_form, form_variant=raw_form_variant,
    form_type=raw_form_type, form_label=raw_form_label,
    db=db,   # NEW
)
```
(same for the `update_school` call site at `:2941`, which already has `existing_school=school`
— just add `db=db` there too).

No DB migration needed — `School.default_form` is already a plain `String(50)` with no CHECK
constraint (`src/models/core.py:286`), so `"custom"` is a valid value the moment the Python
validation allows it.

Note this only fixes *assignment* — it doesn't touch §2.1's actual rendering gap. A school with
`default_form: "custom"` will save successfully once this lands, but faculty in that school still
see nothing different until the rendering engine in §3 exists.

### 2.3 `requireCompleteRows` isn't enforced at final submission

Admin UI's builder lets a table field be flagged `requireCompleteRows: true`, and the *admin
preview* checks it client-side (`src/utils/tableRowValidation.js`). Grepped
`src/api/v1/appraisal.py` for `require_complete_rows` / `requireCompleteRows`: **no hits**. The
real submit endpoint does not check this flag at all — a faculty member (once the rendering
engine in §2.1 exists) could submit a table with half-filled rows even if the admin marked it
required-complete.

**Needed:** at the final-submit transaction, for each table field with `requireCompleteRows:
true` on the resolved schema, reject (422, structured `{table, row, column}` errors) any row that
has *any* filled cell but is missing a value in another *active, non-computed* column of that
same row — mirroring exactly the logic already written client-side in
`tableRowValidation.js`'s `incompleteTableRows()` (ignore fully-empty rows, ignore
`computed`/inactive columns, whitespace-only counts as empty, `0`/`false` count as answered, a
`conditionalText` "Other" choice requires its extra text). Load the schema fresh from the DB at
submit time — never trust a client-supplied flag.

### 2.4 No family-level archive/permanent-delete endpoint

Confirmed no route matching `/admin/form-families` exists anywhere in `admin.py`. Today, deleting
a family made entirely of core sections just retires every section in it (`active=False`) — the
family stays in the Admin UI list forever as "Inactive schema" (this is what the screenshot of
`"all_teaching": 0 records deleted; 10 core records retired` is showing — expected behavior, not
a bug, given §1.2's per-section delete/retire rule).

If a genuine "make this family disappear from the library" action is wanted, it needs new backend
work (this was speced in an earlier draft of this doc and is still valid, kept concise here since
it's optional/lower priority than §2.1-§2.3):

- A family-level archive endpoint, separate from per-section `active`, with a `delete-impact`
  precheck (counts of schools/appraisals referencing the family) before allowing it.
- Exclude archived families from the default Admin UI list; `include_archived=true` for an
  explicit view.
- Never resurrect archived families on server restart/seed.

---

## 3. The prompt — hand this to a session rooted in the faculty-appraisal-frontend repo

This closes §2.1, the actual remaining blocker to "it perfectly works end to end." Paste this as
the opening message of a **new** Claude Code session with its working directory set to the
faculty-appraisal-frontend repo (confirm with the user which of the several copies under
`Frontend DYPIU Final\` is the live one before starting — do not guess):

> Build a schema-driven rendering engine for the faculty appraisal form, reading from the
> backend endpoint that already exists: `GET /api/v1/appraisal/form-schema?form_family=&academic_year=`
> (see `src/api/v1/appraisal.py:129-170` — it's already filtered server-side to active
> sections/fields and respects `table_order`).
>
> Today the form is fully hand-coded in `src/features/faculty-appraisal/forms/standard/StandardMyAppraisal.jsx`
> and `.../CreativeSchool/CreativeSchoolAppraisalForm.jsx`, plus separate reviewer-view components
> under `src/components/appraisal/PartA-D/*.jsx`. Replace all of that with one component,
> `<SchemaSectionTable section={section} mode={"self"|"review"} .../>`, driven entirely by the
> field shape the backend already returns: `{ id, key, label, type, required, options,
> triggerValue, extraLabel, rowMax, maxMarks, isCustom, active, autoSerial, columns: [{ name,
> type, maxMarks }] }`. Field `type` is a closed enum: `text | textarea | number | integer | date
> | dropdown | conditionalText | checkbox | computed | file | table` — do not invent new ones.
>
> Hard constraints:
> - Do not change the wire format of `PUT /appraisal/snapshot` or `POST /appraisal/submit` — the
>   backend already knows how to split a submitted row into core SQL columns vs. `custom_fields`
>   jsonb vs. a brand-new `CustomSectionRow` (see `src/api/v1/appraisal.py`, the section around
>   "Handle custom / dynamic sections") — match the payload shape it already expects, keyed by
>   `section_key` or `code`, rather than changing the backend.
> - Preserve every existing scoring formula (lecture guideline, feedback guideline, external
>   project guideline, consultancy guideline, etc.) exactly — port the functions from
>   `src/utils/appraisalFormUtils.js`, don't reimplement them from scratch.
> - Table fields render add/remove-row the same way Admin UI's live preview does: delete only
>   removes the last row, never an arbitrary one — this is a deliberate, already-familiar
>   constraint for faculty, not a bug to fix.
> - Do client-side `requireCompleteRows` validation too (same rules as
>   `pbas_admin/src/utils/tableRowValidation.js`'s `incompleteTableRows`), but treat it as
>   UX-only until the backend also enforces it server-side (see the admin_ui doc's §2.3 — that's
>   a separate, still-open backend task; don't skip submitting just because the client thinks a
>   row is incomplete once that server check exists, let the server's 422 be authoritative).
> - Load the current academic year's schema once per session, not per field render.
>
> Migrate incrementally: port Standard first, diff computed totals/payload shape against the old
> renderer on the same data before cutting over, then Creative, then remove the old PartA-D
> reviewer components last.

---

## 4. Reference — Admin UI side of this (already built, for context)

- `src/data/pbasFormSeed.js` — the real Standard/Creative section & field structure, used only to
  seed the two default forms in the Admin UI's local library on first load.
- `src/utils/dynamicFormRegistry.js` — legacy browser-only draft helpers (`saveDynamicForm`,
  `setPublished`, etc.); no longer the save path for backend-managed forms.
- `src/utils/backendFormSchemas.js` — the real adapter: `createSchemaStore(api.formSchemas)`
  loads/groups/saves/removes against the five endpoints in §1.2, handling key-locking, per-part
  empty-section rejection, and partial-failure reporting.
- `src/api/client.js`'s `formSchemas` — the five authenticated HTTP calls.
- `src/pages/forms/DynamicFormPage.jsx` — Parts → Tables editor, live interactive preview (one
  part per page), document-upload fields (blob-URL only, no real attachment storage yet), Save
  schema / Activate / Deactivate actions wired to the adapter above.

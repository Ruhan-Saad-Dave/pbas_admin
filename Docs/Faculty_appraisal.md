# Prompt — make the faculty appraisal form dynamic (nothing else)

Paste everything in the box below as the opening message of a **new** session rooted in the
real faculty-appraisal-frontend repo (confirm which of the several copies under
`Frontend DYPIU Final\` is the actually-deployed one before starting anything — do not guess).

This is a single-purpose task: **only** replace how the form's fields/sections are sourced
(hardcoded JS → the backend schema). Everything else about the app — look, feel, navigation,
approval routing, scoring, save/submit behavior — must come out identical to before.

**Backend status — read before using this:** the endpoint and payload shape below describe a
design verified by reading source in one specific backend repo
(`Faculty_appraisal/src/api/v1/appraisal.py:129-170`), not a confirmed-live contract for whatever
backend the frontend repo you're pasting this into actually calls. The backend owner is making
the corresponding backend changes separately — do not assume this endpoint is already live
against your target deployment. The prompt below has a Step 0 for exactly this reason: verify
before building anything against it.

---

> ## Step 0 — verify before building anything (do this first, every time)
>
> This task depends on a backend endpoint, `GET /api/v1/appraisal/form-schema?form_family=&academic_year=`,
> that is being built/updated separately by the backend owner. Before writing any frontend code:
>
> 1. Confirm with the backend owner (or by hitting it directly against whatever base URL this
>    repo's `.env`/config actually points at) that this endpoint is deployed and reachable.
> 2. Call it for real, for at least one `form_family`, and read the actual JSON it returns.
> 3. Compare that real response against the shape assumed below (§"What actually becomes
>    dynamic"). If it differs — different field names, different nesting, missing properties —
>    **build against the real response, and tell the person who gave you this prompt what
>    changed.** Do not silently reshape your assumption to match the shape below, and do not
>    invent/guess a response shape if the endpoint isn't reachable yet — stop and ask instead.
> 4. If the endpoint genuinely isn't live yet, stop here and say so rather than proceeding on
>    the assumed shape. This task is frontend-only (see "No backend changes" below) — it cannot
>    responsibly start until there's something real to point at.
>
> ## Task
>
> Once Step 0 is confirmed: make the faculty appraisal form's structure dynamic — driven by that
> endpoint — instead of the hardcoded section/field constants currently baked into the form
> components. (Reference implementation read while drafting this prompt:
> `Faculty_appraisal/src/api/v1/appraisal.py:129-170` in one backend repo — treat it as a
> starting reference for what the shape is *intended* to be, not as proof it's live for you.)
>
> Today the form is fully hand-coded in:
> - `src/features/faculty-appraisal/forms/standard/StandardMyAppraisal.jsx`
> - `src/features/faculty-appraisal/forms/CreativeSchool/CreativeSchoolAppraisalForm.jsx`
> - `src/components/appraisal/PartA-D/*.jsx` (reviewer views)
>
> Replace the *source of the section/field list* in these with data fetched from that endpoint.
> That is the entire scope of this task.
>
> ## Absolutely do not change
>
> - **No design or UI changes of any kind.** Every input, table, button, spacing value, color,
>   font, animation, and layout must look and behave pixel-identical to today. If a component
>   currently renders a text box a certain way, the dynamic version must render that same text
>   box the same way — you are swapping where the field *list* comes from, not how a field
>   *looks*.
> - **No workflow changes.** Approval chain / reviewer routing, submission statuses, tab
>   navigation, which role sees what, save-draft vs. submit behavior, and timing of validation —
>   all identical to current behavior. Do not "improve" or restructure any of this.
> - **No backend changes from this task.** The backend owner is handling that endpoint
>   separately. Do not modify any backend file, any database table, or any other API route from
>   this frontend task — if Step 0 reveals the backend isn't ready or the response shape doesn't
>   match, that's a message back to the backend owner, not something to patch around here.
> - **No wire-format changes.** `PUT /appraisal/snapshot` and `POST /appraisal/submit` must
>   receive exactly the same shaped payload they receive today, keyed by `section_key`/`code` —
>   match whatever the currently-deployed backend for *this* repo expects for those two routes
>   (verify by reading its current request handling or by asking, the same way you verified the
>   schema endpoint in Step 0 — don't assume the reference backend's routing logic is what this
>   deployment actually has).
> - **No new field types, no new validation behavviors, no new UI patterns** beyond what's
>   already in the closed type enum below. If a field type isn't in this list, it doesn't exist.
> - Do not touch anything in the admin dashboard (`pbas_admin`) repo — that's a separate project.
>
> ## What actually becomes dynamic
>
> Only this: the *list* of parts, the sections within each part, and the fields within each
> section (their label, type, required flag, options, per-row/table max marks, and — for table
> fields — their columns) now come from the schema response instead of a hardcoded JS array.
> Everything about how each of those fields is *rendered and behaves* stays exactly as it is
> today.
>
> Field `type` is a closed enum — do not invent others:
> `text | textarea | number | integer | date | dropdown | conditionalText | checkbox | computed
> | file | table`
>
> Each field/column is expected to carry: `{ id, key, label, type, required, options,
> triggerValue, extraLabel, rowMax, maxMarks, isCustom, active, autoSerial, columns: [{ name,
> type, maxMarks }] }` — **this is the target shape, confirm it against the real response in
> Step 0 before relying on it.**
>
> ## Must preserve exactly
>
> - Every existing scoring formula (lecture guideline, feedback guideline, external project
>   guideline, consultancy guideline, etc.) — port the functions from
>   `src/utils/appraisalFormUtils.js` verbatim. Do not reimplement or "simplify" them.
> - The existing table row convention: delete only ever removes the *last* row, never an
>   arbitrary one. This is a deliberate, already-familiar behavior for faculty — not something to
>   fix or improve.
> - The existing look of every input type (text box, table, dropdown, date field, file upload,
>   etc.) exactly as currently styled.
>
> ## Getting the exact styling right — extract it, don't recreate it from memory
>
> Before writing a single line of the new component, go through `StandardMyAppraisal.jsx`,
> `CreativeSchoolAppraisalForm.jsx`, and the `PartA-D/*.jsx` reviewer views and **pull out the
> actual current markup/className/inline-style/CSS for every input type they render** — the
> table wrapper and its header/row/cell markup, the plain text cell (the `TI` component or
> whatever it's called there), the numeric cell, the date cell, the dropdown cell, the file/doc
> upload cell and its "view attachment" control, the read-only/computed cell, the row add/remove
> buttons, the section heading, and the reviewer-mode extra column(s). Copy that exact
> JSX/className/CSS into the new field-type renderers inside `SchemaSectionTable` — one renderer
> per closed-enum type, each visually and structurally identical to its current hardcoded
> counterpart, including hover states, focus states, error/invalid styling, spacing, and
> responsive behavior. Do not eyeball it or restyle from a general description of "what it looks
> like" — read the real code and reuse it. If two of the hardcoded forms style the same field
> type slightly differently (e.g. Standard vs. Creative), keep the discrepancy and match
> whichever one the section's `form_family` corresponds to, rather than picking one and
> normalizing it away.
>
> ## How to build it
>
> One schema-driven render component, e.g. `<SchemaSectionTable section={...}
> mode={"self"|"review"} />`, that reads a section's field list and renders it using the *same*
> input primitives/styles the current hand-coded forms already use — don't introduce new visual
> components to do this.
>
> Migrate incrementally, not as one rewrite:
> 1. Port Standard first. Render it side by side with the current hand-coded
>    `StandardMyAppraisal.jsx` on the same data and diff the computed totals and the outgoing
>    payload shape before cutting over.
> 2. Only once verified identical, port Creative School the same way.
> 3. Only then remove the old hand-coded components and the separate `PartA-D/*.jsx` reviewer
>    views, replacing them with the same component in `mode="review"`.
>
> Report back with a diff of before/after payload shape and computed totals for at least one real
> faculty record in each form family, proving nothing changed except where the field list came
> from.

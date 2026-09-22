# Combined Top and Left Headers

The Admin builder adds layout `matrix` alongside existing `columns` and `rows`.
Example field metadata:

```json
{
  "type": "table",
  "layout": "matrix",
  "rowHeaderTitle": "No. of leaves taken in the year",
  "rowHeaders": [
    {"id": "taken", "label": "Taken"},
    {"id": "out_of", "label": "Out of"}
  ],
  "columns": [
    {"name": "CL", "type": "integer"},
    {"name": "ML", "type": "integer"},
    {"name": "OD", "type": "integer"},
    {"name": "C/Off", "type": "integer"}
  ]
}
```

- Round-trip layout, rowHeaderTitle, rowHeaders and their order through schema
  reads/writes. Row IDs must be unique/nonempty; blank labels are allowed.
- Matrix rows are configured by Admin. The preview associates cell answers with
  `_matrixRowId`, preserving identity when labels/order change. Agree on stable
  row-ID serialization with the faculty renderer before enabling real submissions.
- Auto-serial display is suppressed in matrix mode without changing its saved
  setting. The top-left heading and row labels are metadata, never answers.
- Complete-row validation applies to configured rows only, excluding headers.
  Removed rows do not participate; entirely blank rows follow existing optional
  row rules. No scoring formulas or calculated totals are introduced.
- Matrix tables cannot merge headers with preceding tables.
- Preview Add Column edits the draft schema, inserting before any locked score
  column. Existing score rules and column sizing/reordering remain available.
- For the lower label/value block in the reference, use a second table with
  existing `rows` layout and the desired text/numeric/dropdown fields.
- Faculty and backend support for this layout must be verified separately.
  Admin preview support does not establish production submission support.

export function matrixPreviewRows(field, answers = []) {
  return (field.rowHeaders || []).map(header => ({
    ...(answers.find(row => row._matrixRowId === header.id) || {}),
    _matrixRowId: header.id,
  }));
}

import test from 'node:test';
import assert from 'node:assert/strict';
import { matrixPreviewRows } from './matrixTable.js';
import { incompleteTableRows } from './tableRowValidation.js';
import { readField } from './backendFormSchemas.js';

test('matrix row identities survive renaming/reordering and exclude removed rows', () => {
  const field = { rowHeaders: [{ id: 'out', label: 'Out of' }, { id: 'taken', label: '' }] };
  const rows = matrixPreviewRows(field, [{ _matrixRowId: 'taken', CL: 1 }, { _matrixRowId: 'out', CL: 2 }, { _matrixRowId: 'removed', CL: 9 }]);
  assert.deepEqual(rows.map(r => r.CL), [2, 1]);
});
test('header metadata never satisfies complete-row checks', () => {
  const field = { requireCompleteRows: true, rowHeaders: [{ id: 'taken', label: 'Taken' }], columns: [{ name: 'CL', type: 'integer' }, { name: 'ML', type: 'integer' }] };
  assert.deepEqual(incompleteTableRows(field, matrixPreviewRows(field)), []);
  assert.equal(incompleteTableRows(field, matrixPreviewRows(field, [{ _matrixRowId: 'taken', CL: 0 }])).length, 1);
});
test('backend field reader preserves matrix configuration', () => {
  const field = { id: 'matrix', type: 'table', layout: 'matrix', rowHeaderTitle: 'Leave', rowHeaders: [{ id: 'taken', label: 'Taken' }], columns: [] };
  const read = readField(field);
  assert.equal(read.layout, 'matrix');
  assert.deepEqual(read.rowHeaders, field.rowHeaders);
  assert.equal(read.rowHeaderTitle, 'Leave');
});

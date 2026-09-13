import test from 'node:test';
import assert from 'node:assert/strict';
import { createSchemaStore, formsFromSchemas } from './backendFormSchemas.js';

function fixture() {
  let rows = [];
  const calls = [];
  const api = {
    list: async () => structuredClone(rows),
    create: async data => { calls.push(['POST', data.code]); rows.push(structuredClone(data)); },
    updateFields: async (code, data) => { calls.push(['FIELDS', code]); Object.assign(rows.find(r => r.code === code), structuredClone(data)); },
    update: async (code, data) => { calls.push(['PUT', code]); Object.assign(rows.find(r => r.code === code), structuredClone(data)); },
    remove: async code => { calls.push(['DELETE', code]); rows = rows.filter(r => r.code !== code); },
  };
  const form = {
    backendFamily: 'custom_test', label: 'Example', parts: ['Part B', 'Part A'], tableOrder: ['t2', 't1'],
    sections: ['A', 'B'].map((p, i) => ({
      id: 's' + i, part: 'Part ' + p, title: p, active: true,
      fields: [{ id: 't' + (i + 1), type: 'table', label: p, requireCompleteRows: true, columns: [
        { name: 'Category', type: 'conditionalText', placeholder: 'Choose category', maxMarks: 9 },
        { name: 'Score', type: 'number', maxMarks: 0 },
      ] }],
    })),
  };
  return { api, calls, form };
}
test('new schemas save inactive and round-trip IDs, order, placeholders and complete-row settings', async () => {
  const { api, form } = fixture();
  const [saved] = await createSchemaStore(api).save(form);
  assert.deepEqual(saved.parts, form.parts);
  assert.deepEqual(saved.tableOrder, form.tableOrder);
  assert.equal(saved.published, false);
  assert.equal(saved.sections[0].fields[0].requireCompleteRows, true);
  assert.equal(saved.sections[0].fields[0].columns[0].placeholder, 'Choose category');
  assert.equal(saved.sections[0].fields[0].columns[0].maxMarks, null);
  assert.equal(saved.sections[0].fields[0].columns[1].maxMarks, 0);
});
test('subsequent saves update stable backend codes without duplicate creates', async () => {
  const { api, form, calls } = fixture(); const store = createSchemaStore(api);
  const [saved] = await store.save(form);
  saved.sections[0].fields[0].label = 'Renamed';
  await store.save(saved);
  assert.equal(calls.filter(c => c[0] === 'POST').length, 2);
  assert.equal(calls.filter(c => c[0] === 'FIELDS').length, 2);
});
test('activation and deactivation use backend active flags', async () => {
  const { api, form } = fixture(); const store = createSchemaStore(api);
  const [saved] = await store.save(form);
  const [active] = await store.save(saved, { activate: true });
  assert.equal(active.published, true);
  const [inactive] = await store.save(active, { activate: false });
  assert.equal(inactive.published, false);
});
test('partial failure can retry without duplicating successful creates', async () => {
  const { api, form, calls } = fixture(); const create = api.create;
  let fail = true;
  api.create = async data => { if (data.part === 'Part A' && fail) throw Error('offline'); return create(data); };
  const store = createSchemaStore(api);
  await assert.rejects(store.save(form), /Some requests may already have succeeded/);
  fail = false;
  await store.save(form);
  assert.equal(calls.filter(c => c[0] === 'POST').length, 2);
});
test('deletion is scoped to the selected backend family', async () => {
  const { api, form } = fixture(); const store = createSchemaStore(api);
  await store.save(form);
  await api.create({ code: 'other', form_family: 'other', fields: [] });
  await store.remove(form);
  assert.deepEqual((await api.list()).map(r => r.code), ['other']);
});
test('canonicalizes backend conditional type without losing configuration', () => {
  const [form] = formsFromSchemas([{ code: 's', form_family: 'x', part: 'A', active: false, fields: [
    { id: 't', type: 'table', columns: [{ name: 'Type', type: 'conditionaltext', triggerValue: 'Other', options: ['Other'] }] },
  ] }]);
  assert.equal(form.sections[0].fields[0].columns[0].type, 'conditionalText');
});
test('malformed reads and unsupported empty parts are rejected', async () => {
  assert.throws(() => formsFromSchemas({}), /expected a list/);
  const { api, form } = fixture();
  form.parts.push('Empty');
  await assert.rejects(createSchemaStore(api).save(form), /Empty parts/);
});

test('core retirement is reported as retained, not permanent deletion', async () => {
  const rows = [{ code: 'core', form_family: 'standard', storage_table: 'teaching', active: true }];
  const store = createSchemaStore({
    list: async () => structuredClone(rows),
    remove: async () => { rows[0].active = false; },
  });
  assert.deepEqual(await store.remove({ backendFamily: 'standard' }), { deleted: 0, retired: 1 });
});

test('a successful HTTP delete that leaves active records is not reported as success', async () => {
  const store = createSchemaStore({
    list: async () => [{ code: 'core', form_family: 'standard', storage_table: 'teaching', active: true }],
    remove: async () => ({}),
  });
  await assert.rejects(store.remove({ backendFamily: 'standard' }), /remain active/);
});

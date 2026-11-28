import assert from 'node:assert/strict';
import { request as httpRequest } from 'node:http';
import { test } from 'node:test';
import { createAppServer } from '../scripts/dev-server.mjs';
import { maxRequestBytes, validateSubmission } from '../server/complaints.mjs';

function validForm(overrides = {}) {
  const values = {
    19: '10181', 2: '10182', 4: ' Avery ', 6: 'Example', 23: ['10184'],
    7: 'avery@example.com', 38: '10188', 10: '2026-10-01', 11: 'Judge Example',
    45: 'party', 50: 'Website', 12: 'A description of the alleged conduct.',
    14: '1', 15: '1', 16: '1', 17: '1', 18: '1', 39: '1', 40: '1',
    ...overrides,
  };
  const form = new FormData();
  for (const [id, value] of Object.entries(values)) {
    for (const entry of Array.isArray(value) ? value : value === null ? [] : [value]) form.append(id, entry);
  }
  return form;
}

const pdf = () => new Blob(['%PDF-1.7\nPDF test fixture\n%%EOF'], { type: 'application/pdf' });

test('normalizes names and keeps all visible answers and selected labels', async () => {
  const data = await validateSubmission(validForm());
  assert.equal(data.firstName, 'Avery');
  assert.equal(data.middleName, null);
  assert.equal(data.lastName, 'Example');
  assert.equal(data.email, 'avery@example.com');
  assert.deepEqual(data.answers[23].selectedLabels, ['Email']);
  assert.deepEqual(data.answers[12].values, ['A description of the alleged conduct.']);
  assert.deepEqual(data.answers[14].selectedLabels, ['I understand']);
  assert.deepEqual(data.attachments.create, []);
});

test('conditional answers are required and hidden answers are discarded', async () => {
  await assert.rejects(validateSubmission(validForm({ 38: '10187', 29: '10189' })), /case number/);
  await assert.rejects(validateSubmission(validForm({ 45: '10198' })), /Explain your role/);
  const data = await validateSubmission(validForm({
    23: '10186', 28: '123 Example Street', 7: 'hidden-invalid-email',
    8: 'hidden-case-number', 48: 'hidden-role-description',
  }));
  assert.equal(data.email, null);
  for (const id of ['7', '8', '48']) assert.equal(Object.hasOwn(data.answers, id), false);
  assert.deepEqual(data.answers[28].values, ['123 Example Street']);
});

test('saves both contact methods, case details and an Other role', async () => {
  const data = await validateSubmission(validForm({
    23: ['10184', '10186'], 28: '123 Example Street', 38: '10187',
    29: '10189', 8: 'CASE-123', 9: 'Example case', 45: '10198', 48: 'Observer',
  }));
  for (const id of ['7', '28', '29', '8', '9', '48']) assert(Object.hasOwn(data.answers, id));
  assert.deepEqual(data.answers[45].selectedLabels, ['Other']);
});

test('rejects blocked complaints, missing required fields and forged choices', async () => {
  for (const overrides of [
    { 19: '10180' }, { 2: '10183' }, { 4: ' ' }, { 23: null },
    { 23: ['forged'] }, { 45: 'forged' }, { 14: null }, { 40: 'no' },
    { 4: ['First', 'Second'] }, { 23: ['10184', '10184'] },
    { 4: 'x'.repeat(201) }, { 12: 'x'.repeat(50001) },
    { unknown: 'value' }, { ['__proto__']: 'value' },
  ]) {
    await assert.rejects(validateSubmission(validForm(overrides)), { status: 400 });
  }
});

test('validates email and real calendar dates', async () => {
  for (const overrides of [{ 7: 'invalid' }, { 10: '2026-02-30' }, { 10: 'not-a-date' }, { 10: '2025-02-29' }]) {
    await assert.rejects(validateSubmission(validForm(overrides)), { status: 400 });
  }
  await validateSubmission(validForm({ 10: '2024-02-29' }));
});

test('stores PDF contents and ignores an empty browser file placeholder', async () => {
  const form = validForm();
  form.append('13', pdf(), 'evidence.pdf');
  form.append('13', new Blob([]), '');
  const data = await validateSubmission(form);
  assert.equal(data.attachments.create.length, 1);
  assert.equal(data.attachments.create[0].filename, 'evidence.pdf');
  assert.equal(data.attachments.create[0].byteSize, pdf().size);
  assert.equal(data.attachments.create[0].content.toString(), await pdf().text());
});

test('rejects empty, oversized, forged or excess attachments', async () => {
  for (const [file, name] of [
    [new Blob([]), 'empty.pdf'],
    [new Blob(['not a PDF'], { type: 'application/pdf' }), 'fake.pdf'],
    [new Blob(['%PDF-1.7'], { type: 'text/plain' }), 'wrong-type.pdf'],
    [pdf(), 'wrong-extension.txt'],
    [new Blob([new Uint8Array(5 * 1024 * 1024 + 1)], { type: 'application/pdf' }), 'large.pdf'],
  ]) {
    const form = validForm();
    form.append('13', file, name);
    await assert.rejects(validateSubmission(form), { status: 400 });
  }
  const form = validForm();
  for (let i = 0; i < 6; i++) form.append('13', pdf(), `${i}.pdf`);
  await assert.rejects(validateSubmission(form), /no more than 5/);
  const forged = validForm();
  forged.append('13', 'not-a-file');
  await assert.rejects(validateSubmission(forged), { status: 400 });
});

async function startServer(t, saveComplaint) {
  const server = createAppServer({ saveComplaint });
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  t.after(() => new Promise(resolve => {
    server.close(resolve);
    server.closeAllConnections();
  }));
  return `http://127.0.0.1:${server.address().port}`;
}

test('POST saves a complaint and attachments together and returns only its ID', async t => {
  const id = 'f7e7adbb-f599-4281-9599-e98aa4529bd6';
  let saved;
  const base = await startServer(t, async data => { saved = data; return { id }; });
  const body = validForm();
  body.append('13', pdf(), 'evidence.pdf');
  const response = await fetch(`${base}/api/complaints`, { method: 'POST', body, headers: { Origin: base } });
  assert.equal(response.status, 201);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.deepEqual(await response.json(), { id });
  assert.equal(saved.firstName, 'Avery');
  assert.equal(saved.attachments.create[0].filename, 'evidence.pdf');
  assert.equal((await fetch(base)).status, 200);
});

test('API rejects invalid input, wrong methods, cross-site and malformed requests before saving', async t => {
  let saves = 0;
  const base = await startServer(t, async () => { saves++; return { id: 'unused' }; });
  let response = await fetch(`${base}/api/complaints`);
  assert.equal(response.status, 405);
  assert.equal(response.headers.get('allow'), 'POST');
  response = await fetch(`${base}/api/complaints`, { method: 'POST', body: validForm({ 12: '' }) });
  assert.equal(response.status, 400);
  response = await fetch(`${base}/api/complaints`, { method: 'POST', body: validForm(), headers: { Origin: 'https://other.example' } });
  assert.equal(response.status, 403);
  response = await fetch(`${base}/api/complaints`, { method: 'POST', body: validForm(), headers: { Origin: 'null' } });
  assert.equal(response.status, 403);
  response = await fetch(`${base}/api/complaints`, { method: 'POST', body: '{}' });
  assert.equal(response.status, 415);
  response = await fetch(`${base}/api/complaints`, { method: 'POST', body: 'broken', headers: { 'Content-Type': 'multipart/form-data; boundary=missing' } });
  assert.equal(response.status, 400);
  assert.equal(saves, 0);
});

test('API enforces the total request size with and without Content-Length', async t => {
  const base = await startServer(t, async () => { assert.fail('oversized requests must not be saved'); });
  for (const knownLength of [true, false]) {
    const result = await new Promise((resolve, reject) => {
      const request = httpRequest(`${base}/api/complaints`, {
        method: 'POST',
        agent: false,
        headers: {
          'Content-Type': 'multipart/form-data; boundary=test',
          ...(knownLength ? { 'Content-Length': maxRequestBytes + 1 } : { 'Transfer-Encoding': 'chunked' }),
        },
      }, response => {
        let body = '';
        response.on('data', chunk => body += chunk);
        response.on('end', () => resolve({ status: response.statusCode, body }));
      });
      request.on('error', reject);
      request.end(knownLength ? undefined : Buffer.alloc(maxRequestBytes + 1));
    });
    assert.equal(result.status, 413, `${knownLength ? 'fixed-length' : 'streamed'} request: ${result.body}`);
    assert.match(JSON.parse(result.body).error, /too large/);
  }
});

test('database failures return a retryable error without exposing details', async t => {
  const log = t.mock.method(console, 'error', () => {});
  const base = await startServer(t, async () => {
    throw Object.assign(new Error('private database credentials'), { code: 'P1001' });
  });
  const response = await fetch(`${base}/api/complaints`, { method: 'POST', body: validForm() });
  assert.equal(response.status, 503);
  const body = await response.text();
  assert.match(body, /could not be saved/);
  assert.doesNotMatch(body, /private database credentials|P1001/);
  assert.deepEqual(log.mock.calls[0].arguments, ['Complaint save failed:', 'P1001']);
});

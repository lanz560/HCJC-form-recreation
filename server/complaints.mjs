import { readFile } from 'node:fs/promises';
import { choices, questionIds, visibleSections } from '../dist/rules.mjs';

const design = JSON.parse(await readFile(new URL('../dist/form.json', import.meta.url), 'utf8'));
const maxFileBytes = 5 * 1024 * 1024;
export const maxRequestBytes = 26 * 1024 * 1024;

export class SubmissionError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

export async function validateSubmission(formData) {
  const answers = Object.create(null);
  const files = [];

  for (const [id, value] of formData) {
    if (!Object.hasOwn(design.questions, id)) {
      throw new SubmissionError(400, 'The form contains an unknown field. Please reload and try again.');
    }
    if (id === '13') {
      if (typeof value === 'string') throw new SubmissionError(400, 'Attachments must be PDF files.');
      if (value.name || value.size) files.push(value);
    } else {
      if (typeof value !== 'string') throw new SubmissionError(400, 'Invalid form field.');
      (answers[id] ||= []).push(value.trim());
    }
  }

  if (answers[19]?.length !== 1 || answers[19][0] !== '10181' ||
      answers[2]?.length !== 1 || answers[2][0] !== '10182') {
    throw new SubmissionError(400, 'This form only accepts complaints about judges, not attorneys.');
  }

  const visibility = visibleSections(design, answers);
  const activeIds = new Set(design.layout.flatMap((section, index) => visibility[index] ? questionIds(section) : []));
  const savedAnswers = {};

  for (const id of activeIds) {
    const question = design.questions[id];
    if (question.type === 'at') continue;
    const values = answers[id] || [];
    const options = choices[id] || question.choices?.map(choice => [choice.id, choice.label]);

    if (question.validation?.rq && !values.some(Boolean)) {
      throw new SubmissionError(400, `Please complete: ${question.label}`);
    }
    if ((question.type !== 'cm' && values.length > 1) || new Set(values).size !== values.length) {
      throw new SubmissionError(400, `Invalid values for: ${question.label}`);
    }
    if (options && values.some(value => !options.some(([option]) => option === value))) {
      throw new SubmissionError(400, `Please select a valid option for: ${question.label}`);
    }
    const maxLength = ['4', '5', '6'].includes(id) ? 200 : question.type === 'te' ? 320 : 50000;
    if (values.some(value => value.length > maxLength)) {
      throw new SubmissionError(400, `${question.label} is too long (maximum ${maxLength} characters).`);
    }
    if (question.type === 'te' && values.some(value => value && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value))) {
      throw new SubmissionError(400, 'Please enter a valid email address.');
    }
    if (question.type === 'da' && values.some(value => {
      const date = new Date(`${value}T00:00:00.000Z`);
      return !/^\d{4}-\d{2}-\d{2}$/.test(value) || !Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== value;
    })) {
      throw new SubmissionError(400, 'Please enter a valid date.');
    }

    savedAnswers[id] = {
      label: question.label,
      values,
      ...(options ? { selectedLabels: values.map(value => options.find(([option]) => option === value)[1]) } : {}),
    };
  }

  if (files.length > 5) throw new SubmissionError(400, 'Please attach no more than 5 PDFs.');
  const attachments = [];
  for (const file of files) {
    if (file.size === 0 || file.size > maxFileBytes) {
      throw new SubmissionError(400, 'Each PDF must contain data and be no larger than 5 MB.');
    }
    if (file.name.length > 255 || !/\.pdf$/i.test(file.name) || (file.type && file.type !== 'application/pdf')) {
      throw new SubmissionError(400, 'Attachments must be PDF files with filenames of at most 255 characters.');
    }
    const content = Buffer.from(await file.arrayBuffer());
    if (content.subarray(0, 5).toString('ascii') !== '%PDF-') {
      throw new SubmissionError(400, 'One of your attachments is not a valid PDF file.');
    }
    attachments.push({ filename: file.name, byteSize: file.size, content });
  }

  return {
    formTemplateId: design.settings.templateFormUuid,
    firstName: answers[4][0],
    middleName: answers[5]?.[0] || null,
    lastName: answers[6][0],
    email: activeIds.has('7') ? answers[7][0] : null,
    answers: savedAnswers,
    attachments: { create: attachments },
  };
}

export async function handleComplaint(request, response, saveComplaint) {
  const send = (status, body, headers = {}) => {
    response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...headers });
    response.end(JSON.stringify(body));
  };

  if (request.method !== 'POST') return send(405, { error: 'Use POST to submit a complaint.' }, { Allow: 'POST' });

  try {
    if (request.headers.origin && !['http:', 'https:'].some(protocol => request.headers.origin === `${protocol}//${request.headers.host}`)) {
      throw new SubmissionError(403, 'Please submit the form from this website.');
    }
    const contentType = request.headers['content-type'] || '';
    if (!/^multipart\/form-data\b/i.test(contentType)) {
      throw new SubmissionError(415, 'Please submit the form with its attachments.');
    }
    if (Number(request.headers['content-length']) > maxRequestBytes) {
      request.resume();
      throw new SubmissionError(413, 'The submission is too large. Attach up to 5 PDFs, 5 MB each.');
    }
    const chunks = [];
    let size = 0;
    for await (const chunk of request.iterator({ destroyOnReturn: false })) {
      size += chunk.length;
      if (size > maxRequestBytes) {
        request.resume();
        throw new SubmissionError(413, 'The submission is too large. Attach up to 5 PDFs, 5 MB each.');
      }
      chunks.push(chunk);
    }

    let formData;
    try {
      formData = await new Request('http://localhost/api/complaints', {
        method: 'POST', headers: { 'Content-Type': contentType }, body: Buffer.concat(chunks),
      }).formData();
    } catch {
      throw new SubmissionError(400, 'The submission could not be read. Please try again.');
    }
    const data = await validateSubmission(formData);
    const submission = await saveComplaint(data);
    send(201, { id: submission.id });
  } catch (error) {
    if (error instanceof SubmissionError) {
      return send(error.status, { error: error.message }, error.status === 413 ? { Connection: 'close' } : {});
    }
    // Database errors may contain personal data or credentials; log only the error code.
    console.error('Complaint save failed:', error.code || error.name);
    send(503, { error: 'Your complaint could not be saved. Your form is still here; please try again.' });
  }
}

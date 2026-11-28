import { choices, visibleSections } from './rules.mjs';

const form = document.querySelector('form');
const container = document.querySelector('#questions');
const submit = document.querySelector('#submit');
const result = document.querySelector('#result');
const escape = value => String(value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

try {
  const response = await fetch('./form.json');
  if (!response.ok) throw new Error('Could not load form');
  const design = await response.json();
  let submitting = false;

  function question(id) {
    const q = design.questions[id];
    const required = q.validation?.rq;
    const label = escape(q.label) + (required ? '<span class="required" aria-hidden="true">*</span>' : '');
    const description = q.description ? `<p class="description" id="desc-${id}">${escape(q.description)}</p>` : '';
    const attrs = `name="${id}" id="q-${id}" ${description ? `aria-describedby="desc-${id}"` : ''} ${required ? 'required' : ''}`;
    if (id === 32 || id === 35) return `<div class="blocked" role="alert"><strong>${label}</strong>${description}</div>`;
    const options = choices[id] || q.choices?.map(c => [c.id, c.label]);
    if (q.type === 'cs' || q.type === 'cm') {
      return `<fieldset class="field" data-question="${id}"><legend>${label}</legend>${description}${options.map(([value,text]) => `<label class="choice"><input type="${q.type === 'cs' ? 'radio' : 'checkbox'}" name="${id}" value="${value}" ${required && (q.type === 'cs' || options.length === 1) ? 'required' : ''}>${escape(text)}</label>`).join('')}</fieldset>`;
    }
    if (q.type === 'at') return `<div class="field"><label for="q-${id}">${label}</label>${description}<div class="upload"><label for="q-${id}">Choose PDF files to attach (up to 5 files, 5 MB each)</label><input type="file" id="q-${id}" name="${id}" accept="application/pdf,.pdf" multiple><ul class="file-list"></ul><p class="file-error" role="alert"></p></div></div>`;
    let control;
    if (q.type === 'cd') control = `<select ${attrs}><option value="">Select…</option>${options.map(([value,text]) => `<option value="${value}">${escape(text)}</option>`).join('')}</select>`;
    else if (q.type === 'rt' || q.type === 'tl') control = q.type === 'rt' ? `<textarea ${attrs} rows="5"></textarea>` : `<input type="text" ${attrs}>`;
    else control = `<input type="${q.type === 'da' ? 'date' : q.type === 'te' ? 'email' : 'text'}" ${attrs}>`;
    return `<div class="field"><label for="q-${id}">${label}</label>${description}${control}</div>`;
  }

  function render(node) {
    const content = () => (node.content || []).map(render).join('');
    switch (node.type) {
      case 'extension': return question(node.attrs.parameters.id);
      case 'text': {
        let text = escape(node.text);
        for (const mark of node.marks || []) {
          if (mark.type === 'strong') text = `<strong>${text}</strong>`;
          if (mark.type === 'link' && /^https:\/\//.test(mark.attrs.href)) text = `<a href="${escape(mark.attrs.href.replace(/\)$/, ''))}" target="_blank" rel="noopener noreferrer">${text}</a>`;
        }
        return text;
      }
      case 'paragraph': return `<p>${content()}</p>`;
      case 'hardBreak': return '<br>';
      case 'bulletList': return `<ul>${content()}</ul>`;
      case 'listItem': return `<li>${content()}</li>`;
      case 'panel': return `<div class="panel ${node.attrs.panelType}"><span class="panel-icon" aria-hidden="true">${node.attrs.panelType === 'warning' ? '!' : node.attrs.panelType === 'success' ? '✓' : 'ⓘ'}</span><div>${content()}</div></div>`;
      case 'layoutSection': return `<div class="columns">${content()}</div>`;
      case 'layoutColumn': return `<div class="column">${content()}</div>`;
      case 'rule': return '<hr>';
      default: return content();
    }
  }

  container.innerHTML = design.layout.map((section,index) => `<section data-section="${index}">${render(section)}</section>`).join('');
  container.setAttribute('aria-busy', 'false');

  function update() {
    const answers = {};
    for (const [name,value] of new FormData(form)) (answers[name] ||= []).push(value);
    const visibility = visibleSections(design, answers);
    container.querySelectorAll('section').forEach((section,index) => {
      section.hidden = !visibility[index];
      section.querySelectorAll('input,select,textarea').forEach(input => input.disabled = !visibility[index]);
    });
    container.querySelectorAll('[data-question="23"]').forEach(group => {
      const inputs = [...group.querySelectorAll('input')];
      inputs[0].setCustomValidity(!inputs[0].disabled && !inputs.some(input => input.checked) ? 'Please select a contact method.' : '');
    });
    submit.disabled = submitting || !(answers[19]?.includes('10181') && answers[2]?.includes('10182'));
  }

  form.addEventListener('change', event => {
    result.textContent = '';
    if (event.target.type === 'file') {
      const input = event.target;
      const files = [...input.files];
      const invalid = files.length > 5 || files.some(file => !/\.pdf$/i.test(file.name) || (file.type && file.type !== 'application/pdf') || !file.size || file.size > 5 * 1024 * 1024);
      const message = invalid ? 'Attach up to 5 PDF files, each containing data and no larger than 5 MB.' : '';
      input.setCustomValidity(message);
      input.parentElement.querySelector('.file-error').textContent = message;
      input.parentElement.querySelector('.file-list').replaceChildren(...files.map(file => {
        const li = document.createElement('li'); li.textContent = file.name; return li;
      }));
    }
    update();
  });
  form.addEventListener('reset', () => {
    result.textContent = '';
    form.querySelectorAll('input').forEach(input => input.setCustomValidity(''));
    document.querySelector('.file-list').replaceChildren();
    document.querySelector('.file-error').textContent = '';
    setTimeout(update, 0);
  });
  form.addEventListener('submit', async event => {
    event.preventDefault();
    if (submitting) return;
    update();
    if (submit.disabled || !form.reportValidity()) return;
    const body = new FormData(form);
    const fields = [...form.querySelectorAll('input,select,textarea')].map(input => [input, input.disabled]);
    submitting = true;
    fields.forEach(([input]) => input.disabled = true);
    submit.disabled = true;
    form.querySelector('[type="reset"]').disabled = true;
    submit.textContent = 'Submitting…';
    result.textContent = 'Saving your submission…';
    try {
      const response = await fetch('/api/complaints', { method: 'POST', body });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || typeof data.id !== 'string' || !data.id) {
        throw new Error(data.error || 'Your submission could not be saved. Please try again.');
      }
      form.reset();
      result.textContent = `Your submission was saved. Reference: ${data.id}.`;
    } catch (error) {
      result.textContent = error instanceof TypeError ? 'Unable to connect. Your form is still here; please try again.' : error.message;
    } finally {
      submitting = false;
      fields.forEach(([input, disabled]) => input.disabled = disabled);
      form.querySelector('[type="reset"]').disabled = false;
      submit.textContent = 'Submit';
      update();
      result.focus();
    }
  });
  update();
} catch (error) {
  container.setAttribute('aria-busy', 'false');
  container.textContent = 'The form could not load. Please reload the page to try again.';
  console.error(error);
}

export const choices = {
  19: [['10180', 'Yes'], ['10181', 'No']],
  2: [['10182', 'Yes'], ['10183', 'No']],
  23: [['10184', 'Email'], ['10186', 'Mailing Address']],
  38: [['10187', 'Yes'], ['10188', 'No'], ['10199', 'Not sure']],
  29: [['10189', 'Yes'], ['10190', 'No']],
  // shortcut: role choices are not included in public page data; verify these against an authenticated reference before production use.
  45: [['party', 'Party to the case'], ['attorney', 'Attorney'], ['witness', 'Witness'], ['10198', 'Other']]
};

function questionIds(node) {
  return node.type === 'extension' ? [String(node.attrs.parameters.id)] : (node.content || []).flatMap(questionIds);
}

export function visibleSections(design, answers) {
  const visibleFields = new Set();
  return design.layout.map((section, index) => {
    const conditions = design.sections[String(index)]?.conditions || [];
    const visible = conditions.every(id => design.conditions[id].i.groups.some(group =>
      group.checks.every(check => visibleFields.has(check.fieldId) && check.constraint.some(value => (answers[check.fieldId] || []).includes(value)))
    ));
    if (visible) questionIds(section).forEach(id => visibleFields.add(id));
    return visible;
  });
}

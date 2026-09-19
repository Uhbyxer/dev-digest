/** Required-field validation for the create-skill-from-conventions form.
    Returns the first translation key for a missing field, or null when the
    form is valid. Mirrors the Skill Editor's validateSkillForm. */
export function validateSkillDraft(input: {
  name: string;
  description: string;
  body: string;
}): "nameRequired" | "descriptionRequired" | "bodyRequired" | null {
  if (input.name.trim().length === 0) return "nameRequired";
  if (input.description.trim().length === 0) return "descriptionRequired";
  if (input.body.trim().length === 0) return "bodyRequired";
  return null;
}

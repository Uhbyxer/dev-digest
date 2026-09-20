import { SkillsLabView } from "./_components/SkillsLabView";

/* Route: /skills (Skills Lab list + preview). Thin route entry — the view,
   its create/import modals, styles, constants, helpers and i18n are colocated
   under _components/SkillsLabView. */
export default function SkillsPage() {
  return <SkillsLabView />;
}

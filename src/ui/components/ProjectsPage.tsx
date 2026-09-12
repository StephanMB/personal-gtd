import { appState, projectViews } from '../app-state.ts';
import { actionsInProject } from '../../domain/queries.ts';
import { copy } from '../copy.ts';
import { navigate } from '../router.ts';

/**
 * Every project you are working on, the ones that have stopped moving first.
 *
 * "Which projects have no next action" is the question a flat list of tasks
 * can never answer, and the reason projects are worth an entity at all, so it
 * is what this page leads with rather than something you have to go looking
 * for.
 */
export function ProjectsPage() {
  const { active, stalledIds } = projectViews.value;
  const items = [...appState.value.items];
  const ordered = [...active].sort(
    (a, b) => Number(stalledIds.has(b.id)) - Number(stalledIds.has(a.id)) || a.createdAt - b.createdAt,
  );

  return (
    <nldd-page sticky-header>
      <nldd-top-title-bar slot="header" text={copy.projects.title} />
      <nldd-simple-section>
        <nldd-list accessible-label={copy.projects.title}>
          <nldd-inline-dialog slot="empty" text={copy.projects.empty} />
          {ordered.map((project) => {
            const open = actionsInProject(items, project.id).filter((item) => item.status !== 'done').length;
            const stalled = stalledIds.has(project.id);
            return (
              <nldd-list-item
                key={project.id}
                button
                onClick={() => navigate({ view: 'project', id: project.id })}
              >
                <nldd-text-cell text={project.title} supporting-text={copy.projects.actionCount(open)} />
                {stalled && (
                  <nldd-cell>
                    <nldd-badge size="sm" color="critical" text={copy.projects.stalled} />
                  </nldd-cell>
                )}
              </nldd-list-item>
            );
          })}
        </nldd-list>
      </nldd-simple-section>
    </nldd-page>
  );
}

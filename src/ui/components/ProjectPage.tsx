import { actionsInProject } from '../../domain/queries.ts';
import { appState, projectViews } from '../app-state.ts';
import { setProjectStatus } from '../commands.ts';
import { copy } from '../copy.ts';
import { navigate } from '../router.ts';
import { CaptureForm } from './CaptureForm.tsx';
import { ItemRow } from './ItemRow.tsx';

/**
 * One project: its outcome, its actions, and a field to add the next one.
 *
 * What you type here is already clarified, so it goes straight to Next rather
 * than through the inbox. A project with nothing moving it says so, in the
 * same red as the sidebar badge that brought you here.
 */
export function ProjectPage({ id }: { id: string }) {
  const { items, projects } = appState.value;
  const project = projects.find((candidate) => candidate.id === id && candidate.deletedAt === undefined);

  if (!project) {
    return (
      <nldd-page sticky-header>
        <nldd-top-title-bar slot="header" text={copy.projects.title} />
        <nldd-simple-section>
          <nldd-inline-dialog variant="alert" text={copy.projects.gone}>
            <nldd-button-group slot="actions" size="sm">
              <nldd-button size="sm" text={copy.projects.back} onClick={() => navigate({ view: 'projects' })} />
            </nldd-button-group>
          </nldd-inline-dialog>
        </nldd-simple-section>
      </nldd-page>
    );
  }

  const actions = actionsInProject([...items], id);
  const stalled = projectViews.value.stalledIds.has(id);

  return (
    <nldd-page sticky-header>
      <nldd-top-title-bar slot="header" text={project.title} />
      <nldd-simple-section>
        <nldd-button
          size="sm"
          variant="neutral-transparent"
          text={copy.projects.back}
          onClick={() => navigate({ view: 'projects' })}
        />

        {(stalled || project.status !== 'active') && (
          <>
            <nldd-spacer size="8" />
            <nldd-badge
              size="sm"
              color={stalled ? 'critical' : 'neutral'}
              text={
                stalled
                  ? copy.projects.stalled
                  : project.status === 'done'
                    ? copy.projects.statusDone
                    : copy.projects.statusDropped
              }
            />
          </>
        )}

        <nldd-spacer size="16" />
        <CaptureForm
          announceInbox={false}
          projectId={id}
          status="next"
          label={copy.projects.addAction}
          placeholder={copy.projects.addActionPlaceholder}
        />

        <nldd-spacer size="16" />
        <nldd-list accessible-label={project.title}>
          <nldd-inline-dialog slot="empty" text={copy.projects.actionCount(0)} />
          {actions.map((item) => (
            <ItemRow key={item.id} item={item} showProject={false} />
          ))}
        </nldd-list>

        <nldd-spacer size="16" />
        <nldd-button-bar size="sm">
          {project.status !== 'done' && (
            <nldd-button size="sm" text={copy.projects.markDone} onClick={() => void setProjectStatus(id, 'done')} />
          )}
          {project.status === 'active' && (
            <nldd-button size="sm" text={copy.projects.drop} onClick={() => void setProjectStatus(id, 'dropped')} />
          )}
          {project.status !== 'active' && (
            <nldd-button size="sm" text={copy.projects.reopen} onClick={() => void setProjectStatus(id, 'active')} />
          )}
        </nldd-button-bar>
      </nldd-simple-section>
    </nldd-page>
  );
}

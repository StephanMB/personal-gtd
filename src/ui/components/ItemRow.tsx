import type { Item } from '../../domain/model.ts';
import { TRANSITIONS } from '../../domain/transitions.ts';
import { projectViews } from '../app-state.ts';
import { deleteItem, run } from '../commands.ts';
import { copy } from '../copy.ts';

/**
 * One item. The row itself is not an action; its buttons are. nldd-list
 * gives the keyboard for free: arrow keys move between rows, Tab walks the
 * buttons of the current row.
 */
export function ItemRow({ item, showProject = true }: { item: Item; showProject?: boolean }) {
  // On a project's own page the tag would repeat the heading on every row,
  // and squeeze the title out of the way to do it.
  const project =
    !showProject || item.projectId === undefined ? undefined : projectViews.value.byId.get(item.projectId);
  return (
    <nldd-list-item>
      <nldd-text-cell text={item.title} />
      {item.context && (
        <nldd-cell>
          <nldd-tag size="sm" text={`@${item.context}`} />
        </nldd-cell>
      )}
      {project && (
        <nldd-cell>
          <nldd-tag size="sm" text={project.title} />
        </nldd-cell>
      )}
      <nldd-spacer-cell size="8" />
      <nldd-cell>
        {/* nldd-button-group stacks vertically by default, which makes every row tall. */}
        <nldd-button-group size="sm" orientation="horizontal">
          {TRANSITIONS[item.status].map((to) => {
            const label = copy.moveLabel(item.status, to);
            return (
              <nldd-button
                key={to}
                size="sm"
                variant="neutral-tinted"
                text={label}
                accessible-label={`${label}: ${item.title}`}
                onClick={() => void run({ type: 'move', id: item.id, to })}
              />
            );
          })}
        </nldd-button-group>
      </nldd-cell>
      <nldd-cell>
        <nldd-icon-button
          size="sm"
          variant="neutral-transparent"
          icon="trash"
          text={copy.deleteLabel(item.title)}
          onClick={() => void deleteItem(item)}
        />
      </nldd-cell>
    </nldd-list-item>
  );
}

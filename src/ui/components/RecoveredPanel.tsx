import { useMemo, useState } from 'preact/hooks';
import { appState } from '../app-state.ts';
import { deleteRecovered, downloadRecovered, listRecovered } from '../commands.ts';
import { copy } from '../copy.ts';

/**
 * Closes the loop the safety mechanism opens. When data cannot be read it is
 * copied aside (step 1 onwards), and until now nothing ever mentioned those
 * copies again: they took space in the same budget and the console was the
 * only way to reach one. Hidden entirely when there is nothing set aside,
 * which is the normal case.
 */
export function RecoveredPanel() {
  const [changes, setChanges] = useState(0);
  // A copy is set aside exactly when a storage problem appears, so re-read then.
  const problem = appState.value.problem;
  const copies = useMemo(() => listRecovered(), [problem, changes]);
  if (copies.length === 0) return null;

  const refresh = () => setChanges((n) => n + 1);

  return (
    <div class="recovered">
      <nldd-title size={6}>{copy.recovered.heading}</nldd-title>
      <nldd-list accessible-label={copy.recovered.heading}>
        {copies.map((entry) => {
          const when = copy.recovered.savedAt(entry.savedAt);
          return (
            <nldd-list-item key={entry.key}>
              <nldd-text-cell text={copy.recovered.rowTitle(when)} supporting-text={copy.recovered.detail(entry.size, entry.reason)} />
              <nldd-spacer-cell size="8" />
              <nldd-cell>
                <nldd-button
                  size="sm"
                  text={copy.recovered.download}
                  accessible-label={copy.recovered.downloadLabel(when)}
                  onClick={() => downloadRecovered(entry)}
                />
              </nldd-cell>
              <nldd-cell>
                <nldd-icon-button
                  size="sm"
                  variant="neutral-transparent"
                  icon="trash"
                  text={copy.recovered.deleteLabel(when)}
                  onClick={() => deleteRecovered(entry, refresh)}
                />
              </nldd-cell>
            </nldd-list-item>
          );
        })}
      </nldd-list>
    </div>
  );
}

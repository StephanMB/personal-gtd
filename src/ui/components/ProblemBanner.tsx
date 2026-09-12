import type { Problem } from '../../store/store.ts';
import { dismissProblem, exportData, resumeSaving } from '../commands.ts';
import { copy } from '../copy.ts';
import { downloadText } from '../download.ts';

/** Storage problems from the store, as an NLDD banner with the matching way out. */
export function ProblemBanner({ problem }: { problem: Problem }) {
  const { text, supporting } = copy.problem(problem);
  const informational = problem.kind === 'unreadable-items' || problem.kind === 'corrupt';
  return (
    <>
      <nldd-banner
        variant={informational ? 'warning' : 'critical'}
        text={text}
        supporting-text={supporting}
        dismissible={informational || undefined}
        ondismiss={dismissProblem}
      >
        {'raw' in problem && (
          <nldd-button
            slot="actions"
            size="sm"
            text={copy.problemActions.download}
            onClick={() => downloadText('gtd-unreadable-data.json', problem.raw)}
          />
        )}
        {problem.kind === 'paused' && (
          <nldd-button slot="actions" size="sm" text={copy.problemActions.resume} onClick={resumeSaving} />
        )}
        {(problem.kind === 'save-failed' || problem.kind === 'unavailable') && (
          <nldd-button slot="actions" size="sm" text={copy.problemActions.export} onClick={exportData} />
        )}
      </nldd-banner>
      <nldd-spacer size="16" />
    </>
  );
}

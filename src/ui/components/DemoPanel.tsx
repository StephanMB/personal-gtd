import { isDemo } from '../app-state.ts';
import { enterDemo, leaveDemo, resetDemo } from '../commands.ts';
import { copy } from '../copy.ts';

/**
 * The way in and out of the demo. Inside it, this is also the reassurance
 * that the lists on screen are not yours: a demo you cannot tell apart from
 * your own data would be worse than no demo at all.
 */
export function DemoPanel() {
  if (!isDemo) {
    return (
      <div class="demo">
        <nldd-button size="sm" variant="neutral-transparent" text={copy.demo.try} onClick={enterDemo} />
      </div>
    );
  }

  return (
    <div class="demo">
      <nldd-badge size="sm" color="warning" text={copy.demo.running} />
      <p class="demo-explain">{copy.demo.explain}</p>
      <nldd-button-group size="sm" orientation="horizontal">
        <nldd-button size="sm" text={copy.demo.leave} onClick={leaveDemo} />
        <nldd-button size="sm" variant="neutral-transparent" text={copy.demo.reset} onClick={resetDemo} />
      </nldd-button-group>
    </div>
  );
}

import { copy } from '../copy.ts';
import { AppearancePanel } from './AppearancePanel.tsx';
import { BackupPanel } from './BackupPanel.tsx';
import { DemoPanel } from './DemoPanel.tsx';

/**
 * Everything that is about the app rather than about your lists.
 *
 * These controls grew one at a time under the sidebar navigation until the
 * lists — the actual point of the app — had to share the pane with export,
 * appearance, language and a demo. They are a page now, so the sidebar is a
 * single list again. Nothing here is needed to get through a day, which is
 * exactly why none of it has to be on screen all day.
 */
export function SettingsPage() {
  return (
    <nldd-page sticky-header>
      <nldd-top-title-bar slot="header" text={copy.settings.title} />
      <nldd-simple-section>
        <div class="settings">
          <nldd-title size={5}>{copy.settings.backup}</nldd-title>
          <BackupPanel />

          <AppearancePanel />

          <nldd-title size={5}>{copy.demo.title}</nldd-title>
          <DemoPanel />
        </div>
      </nldd-simple-section>
    </nldd-page>
  );
}

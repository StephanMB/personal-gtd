import { useEffect } from 'preact/hooks';
import { copy } from './copy.ts';
import { goHome, route } from './router.ts';
import { HOME } from './routes.ts';
import { ClarifyPage } from './components/ClarifyPage.tsx';
import { ListPage } from './components/ListPage.tsx';
import { Sidebar } from './components/Sidebar.tsx';

/**
 * App shell: NLDD's navigation split view. The sidebar (the lists) is the
 * primary pane; the main pane shows the current list. Below the md
 * breakpoint the split view turns the sidebar into a sheet by itself, which
 * is the phone layout for free.
 */
export function App() {
  const current = route.value;
  useEffect(() => {
    if (!current) goHome();
  }, [current]);
  const view = current ?? HOME;
  const status = view.view === 'list' ? view.status : null;

  return (
    <nldd-app-view>
      <nldd-navigation-split-view primary-sidebar-accessible-label={copy.navLabel}>
        <nldd-split-view-pane slot="primary-sidebar" has-content>
          <Sidebar current={status} />
        </nldd-split-view-pane>
        <nldd-split-view-pane slot="main" has-content>
          {view.view === 'clarify' ? <ClarifyPage /> : <ListPage status={view.status} />}
        </nldd-split-view-pane>
      </nldd-navigation-split-view>
    </nldd-app-view>
  );
}

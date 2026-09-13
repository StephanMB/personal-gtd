import { useEffect } from 'preact/hooks';
import { copy } from './copy.ts';
import { goHome, route } from './router.ts';
import { HOME } from './routes.ts';
import { ClarifyPage } from './components/ClarifyPage.tsx';
import { ListPage } from './components/ListPage.tsx';
import { ProjectPage } from './components/ProjectPage.tsx';
import { ProjectsPage } from './components/ProjectsPage.tsx';
import { ReviewPage } from './components/ReviewPage.tsx';
import { SearchPage } from './components/SearchPage.tsx';
import { SettingsPage } from './components/SettingsPage.tsx';
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
  const selected =
    view.view === 'list'
      ? view.status
      : view.view === 'projects' || view.view === 'project'
        ? 'projects'
        : view.view === 'search'
          ? 'search'
          : view.view === 'review'
            ? 'review'
            : view.view === 'settings'
              ? 'settings'
              : null;

  return (
    <nldd-app-view>
      <nldd-navigation-split-view primary-sidebar-accessible-label={copy.navLabel}>
        <nldd-split-view-pane slot="primary-sidebar" has-content>
          <Sidebar current={selected} />
        </nldd-split-view-pane>
        <nldd-split-view-pane slot="main" has-content>
          {view.view === 'clarify' ? (
            <ClarifyPage />
          ) : view.view === 'review' ? (
            <ReviewPage />
          ) : view.view === 'search' ? (
            <SearchPage query={view.query} />
          ) : view.view === 'settings' ? (
            <SettingsPage />
          ) : view.view === 'projects' ? (
            <ProjectsPage />
          ) : view.view === 'project' ? (
            <ProjectPage id={view.id} />
          ) : (
            <ListPage status={view.status} context={view.context} />
          )}
        </nldd-split-view-pane>
      </nldd-navigation-split-view>
    </nldd-app-view>
  );
}

// Design-system components this app renders, one entry point each, plus the
// stylesheet WITHOUT the Rijksoverheid font (see the step 3 guide, 3.4).
// Importing the package root would register all ~110 components.
// nldd-imports.test.ts fails when a <nldd-*> tag in src/ui is not covered here,
// or when an import here is no longer used.
import '@nldd/design-system/styles/system-font';
import '@nldd/design-system/app-view';
import '@nldd/design-system/badge';
import '@nldd/design-system/banner';
import '@nldd/design-system/button';
import '@nldd/design-system/button-bar';
import '@nldd/design-system/button-group';
import '@nldd/design-system/cell';
import '@nldd/design-system/icon-button';
import '@nldd/design-system/icon-cell';
import '@nldd/design-system/inline-dialog';
import '@nldd/design-system/keyboard-shortcut';
import '@nldd/design-system/list';
import '@nldd/design-system/list-item';
import '@nldd/design-system/navigation-split-view';
import '@nldd/design-system/notification';
import '@nldd/design-system/page';
import '@nldd/design-system/simple-section';
import '@nldd/design-system/skip-link';
import '@nldd/design-system/spacer';
import '@nldd/design-system/spacer-cell';
import '@nldd/design-system/split-view-pane';
import '@nldd/design-system/tag';
import '@nldd/design-system/text-cell';
import '@nldd/design-system/text-field';
import '@nldd/design-system/title';
import '@nldd/design-system/top-title-bar';

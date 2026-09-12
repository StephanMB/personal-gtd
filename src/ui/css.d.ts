/**
 * NLDD exposes its stylesheets as export subpaths that resolve to .css files.
 * TypeScript has no types for those, and vite/client only declares specifiers
 * that literally end in ".css". Vite itself resolves and bundles them fine.
 */
declare module '@nldd/design-system/styles/system-font';

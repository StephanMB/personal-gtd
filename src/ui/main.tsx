// Order matters: the design-system elements must be registered before the
// first render, so Preact finds their properties and sets them as properties
// rather than attributes (guide 3.5).
import './nldd.ts';
import './theme.css';
import { render } from 'preact';
import { App } from './App.tsx';
import { installShortcuts } from './shortcuts.ts';

installShortcuts();
render(<App />, document.getElementById('app')!);

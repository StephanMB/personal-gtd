import { useEffect, useRef } from 'preact/hooks';
import type { ContextInUse } from '../../domain/contexts.ts';
import { copy, language } from '../copy.ts';

/**
 * "Only what I can do here."
 *
 * Shown only when the list actually holds more than one context, because a
 * filter with a single option is a control that can never change anything.
 * The choice goes into the URL rather than into a signal, so a filtered list
 * can be bookmarked, survives a reload, and is the same in a second tab.
 *
 * A radio group and not a set of toggles: you are in one place at a time.
 */
export function ContextFilter({
  contexts,
  selected,
  onSelect,
}: {
  contexts: readonly ContextInUse[];
  selected?: string;
  onSelect: (key: string | undefined) => void;
}) {
  const control = useRef<HTMLElementTagNameMap['nldd-segmented-control']>(null);
  const ALL = '';

  useEffect(() => {
    const node = control.current;
    if (!node) return;
    const onChange = (event: Event) => {
      const chosen = (event as CustomEvent<{ value?: string }>).detail?.value;
      onSelect(chosen === undefined || chosen === ALL ? undefined : chosen);
    };
    node.addEventListener('change', onChange);
    return () => node.removeEventListener('change', onChange);
  }, [onSelect]);

  if (contexts.length < 2) return null;

  return (
    <div class="context-filter">
      <nldd-segmented-control
        // Rebuilt when the language changes, so "All" is not left behind, and
        // when the set changes, so a removed context cannot stay selected.
        key={`${language.value}:${contexts.map((c) => c.key).join(',')}`}
        ref={control}
        size="sm"
        accessible-label={copy.filter.label}
        value={selected ?? ALL}
      >
        <nldd-segmented-control-item value={ALL} text={copy.filter.all} />
        {contexts.map((context) => (
          <nldd-segmented-control-item key={context.key} value={context.key} text={`@${context.label}`} />
        ))}
      </nldd-segmented-control>
    </div>
  );
}

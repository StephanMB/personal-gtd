import { useEffect, useRef } from 'preact/hooks';
import { appState } from '../app-state.ts';
import { THEMES, type Theme } from '../appearance.ts';
import { setLanguage, setTheme } from '../commands.ts';
import { copy, LANGUAGES, type Language } from '../copy.ts';

/**
 * Appearance and language, in the sidebar next to the other things that are
 * about the app rather than about your lists.
 *
 * Both are stored in the document, so they survive a reload, travel with a
 * backup and are the same in every tab. "System" is the default for appearance
 * because the operating system already knows whether it is dark outside.
 */
function Choice<T extends string>({
  label,
  value,
  options,
  onSelect,
}: {
  label: string;
  value: T;
  options: { value: T; text: string }[];
  onSelect: (value: T) => void;
}) {
  const control = useRef<HTMLElementTagNameMap['nldd-segmented-control']>(null);

  // The control fires a custom `change` carrying the value; a listener keeps
  // this out of the JSX typing layer, where `onChange` means a form event.
  useEffect(() => {
    const node = control.current;
    if (!node) return;
    const onChange = (event: Event) => {
      const chosen = (event as CustomEvent<{ value?: string }>).detail?.value;
      if (chosen) onSelect(chosen as T);
    };
    node.addEventListener('change', onChange);
    return () => node.removeEventListener('change', onChange);
  }, [onSelect]);

  return (
    <nldd-segmented-control ref={control} size="sm" width="full" accessible-label={label} value={value}>
      {options.map((option) => (
        <nldd-segmented-control-item key={option.value} value={option.value} text={option.text} />
      ))}
    </nldd-segmented-control>
  );
}

export function AppearancePanel() {
  const { theme = 'system', language = 'en' } = appState.value.settings;

  const themeLabels: Record<Theme, string> = {
    system: copy.appearance.system,
    light: copy.appearance.light,
    dark: copy.appearance.dark,
  };
  const languageLabels: Record<Language, string> = {
    en: copy.appearance.english,
    nl: copy.appearance.dutch,
  };

  return (
    <div class="appearance">
      <p class="appearance-label">{copy.appearance.theme}</p>
      <Choice
        label={copy.appearance.theme}
        value={theme}
        options={THEMES.map((option) => ({ value: option, text: themeLabels[option] }))}
        onSelect={(chosen: Theme) => void setTheme(chosen)}
      />
      <p class="appearance-label">{copy.appearance.language}</p>
      <Choice
        label={copy.appearance.language}
        value={language}
        options={LANGUAGES.map((option) => ({ value: option, text: languageLabels[option] }))}
        onSelect={(chosen: Language) => void setLanguage(chosen)}
      />
    </div>
  );
}

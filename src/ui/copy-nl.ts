import type { Dictionary } from './copy-en.ts';

/**
 * Every string in Dutch. Typed as the English dictionary, so a missing or
 * invented key is a compile error rather than a blank label someone finds
 * later.
 *
 * The design system is Dutch by default, which is why the Dutch side needs no
 * overrides for its built-in strings and the English side does.
 */
export const nl: Dictionary = {
  appName: 'Personal GTD',
  skipToList: 'Naar de lijst',
  navLabel: 'Lijsten',

  lists: {
    inbox: 'Inbox',
    next: 'Eerstvolgende acties',
    waiting: 'Wachten op',
    someday: 'Ooit / misschien',
    done: 'Afgerond',
  },

  empty: {
    inbox: 'Inbox leeg. Leg alles vast wat je aandacht heeft.',
    next: 'Geen eerstvolgende acties. Verhelder je inbox om ze toe te voegen.',
    waiting: 'Je wacht op niemand.',
    someday: 'Niets voor later geparkeerd.',
    done: 'Nog niets afgerond.',
  },

  moveLabel(from, to) {
    if (from === 'done') return 'Heropenen';
    if (to === 'done') return 'Afgerond';
    return { inbox: 'Naar inbox', next: 'Eerstvolgend', waiting: 'Wachten', someday: 'Ooit', done: 'Afgerond' }[to];
  },

  capture: {
    label: 'Vastleggen',
    placeholder: 'Leg een gedachte vast… (probeer "Melk kopen @boodschappen")',
    submit: 'Toevoegen',
    addedElsewhere: 'Toegevoegd aan de inbox.',
  },

  deleteLabel: (title) => `"${title}" verwijderen`,
  deleted: (title) => `"${title}" verwijderd.`,
  undo: 'Ongedaan maken',
  undone: 'Ongedaan gemaakt.',

  failure: {
    'empty-input': 'Niets om vast te leggen.',
    'not-found': 'Dit item bestaat niet meer. Misschien is het in een ander tabblad gewijzigd.',
    'not-allowed': 'Dit item is in een ander tabblad verplaatst. De lijst is bijgewerkt.',
    deleted: 'Dit item is in een ander tabblad verwijderd.',
    'nothing-to-undo': 'Niets om ongedaan te maken.',
    'undo-conflict': 'Kan niet ongedaan maken: dit item is sindsdien opnieuw gewijzigd, waarschijnlijk in een ander tabblad.',
    'internal-error': 'Er ging iets mis, dus je gegevens zijn niet gewijzigd.',
  },

  backup: {
    export: 'Exporteren',
    import: 'Importeren…',
    never: 'Nog nooit geëxporteerd.',
    last: (days) => (days === 0 ? 'Laatste export: vandaag.' : `Laatste export: ${days} dag${days === 1 ? '' : 'en'} geleden.`),
    imported: (c) => `Geïmporteerd: ${c.added} nieuw, ${c.updated} bijgewerkt, ${c.deleted} verwijderd.`,
    importFailed: (reason) => `Importeren mislukt: ${reason}`,
  },

  clarify: {
    title: 'Verhelderen',
    start: (count) => `${count} item${count === 1 ? '' : 's'} verhelderen`,
    progress: (position, total) => `Item ${position} van ${total}`,
    question: 'Wat is de eerstvolgende fysieke actie?',
    decisions: {
      next: 'Eerstvolgende actie',
      waiting: 'Wachten op',
      someday: 'Ooit',
      done: 'Afgerond',
      trash: 'Prullenbak',
      project: 'Maak er een project van',
    },
    twoMinuteRule: 'Kost het minder dan twee minuten, doe het nu en druk op d. Alles is terug te draaien met Ctrl+Z.',
    edit: 'Titel bewerken',
    save: 'Opslaan',
    leave: 'Sluiten (Esc)',
    empty: 'Inbox leeg. Niets meer te verhelderen.',
    backToInbox: 'Terug naar de inbox',
  },

  projects: {
    title: 'Projecten',
    stalled: 'Geen eerstvolgende actie',
    stalledCount: (count) => `${count} project${count === 1 ? '' : 'en'} zonder eerstvolgende actie`,
    actionCount: (count) => (count === 0 ? 'Nog geen acties' : `${count} actie${count === 1 ? '' : 's'}`),
    empty: 'Nog geen projecten. Druk in de inbox op p bij iets dat meer dan één actie kost.',
    promoted: (title) => `"${title}" is nu een project. Wat is de eerstvolgende actie?`,
    addAction: 'Eerstvolgende actie toevoegen',
    addActionPlaceholder: 'De eerstvolgende fysieke actie…',
    gone: 'Dit project bestaat niet meer.',
    back: 'Alle projecten',
    markDone: 'Project afgerond',
    drop: 'Laten vallen',
    reopen: 'Heropenen',
    statusDone: 'Afgerond',
    statusDropped: 'Laten vallen',
  },

  review: {
    title: 'Wekelijkse review',
    intro: 'Een ronde langs alles, zodat je de laptop kunt dichtklappen in het vertrouwen dat het systeem compleet is.',
    steps: {
      inbox: 'Inbox leegmaken',
      projects: 'Projecten zonder eerstvolgende actie',
      waiting: 'Wachten op, ouder dan een week',
      someday: 'Ooit, al maanden onaangeroerd',
      completed: 'Wat je deze week hebt afgerond',
      backup: 'Een back-up exporteren',
    },
    clear: 'In orde',
    clarify: (count) => `${count} item${count === 1 ? '' : 's'} verhelderen`,
    toChase: (count) => `${count} om achteraan te gaan`,
    toRevisit: (count) => `${count} om op te pakken of te laten vallen`,
    nothing: 'Hier is niets te doen.',
    completedCount: (count) =>
      count === 0 ? 'Deze week nog niets afgerond.' : `${count} deze week afgerond`,
    exportNow: 'Nu exporteren',
    exportedToday: 'Vandaag geëxporteerd.',
    finish: 'Review afronden',
    finished: 'Review gedaan. Tot volgende week.',
    never: 'Nog nooit gereviewd',
    sinceReview: (days) => (days === 0 ? 'Vandaag gereviewd' : `${days} dag${days === 1 ? '' : 'en'} geleden gereviewd`),
  },

  hints: {
    'capture-context': {
      text: 'Tag waar het gebeurt',
      supporting:
        'Een @woord aan het eind wordt een context: "Melk halen @boodschappen". Zodra een lijst er twee bevat kun je hem tot één terugbrengen, en daar gaat het om: wat je hier en nu echt kunt doen. E-mailadressen blijven heel.',
    },
    'clarify-inbox': {
      text: 'Beslis één keer per item',
      supporting:
        'Verhelderen loopt de inbox van oud naar nieuw af, één beslissing per keer, want de hele lijst steeds opnieuw lezen is hoe een inbox zijn vertrouwen verliest.',
    },
    'clarify-keys': {
      text: 'Eén toets per beslissing',
      supporting:
        'n, w, s voor de lijsten, d als je het net gedaan hebt, t voor de prullenbak, e om het te herschrijven. Niets is definitief: Ctrl+Z draait de laatste terug.',
    },
    'project-first-action': {
      text: 'Wat is de eerstvolgende actie?',
      supporting:
        'De projecttitel is het resultaat dat je wilt. Hier komt het eerstvolgende fysieke ding dat je echt zou doen, en het wordt meteen als eerstvolgende actie opgeslagen.',
    },
    'stalled-projects': {
      text: 'Dit project staat stil',
      supporting:
        'Een project zonder eerstvolgende actie en zonder iemand om achteraan te gaan komt niet vanzelf in beweging. Dat is wat het rode aantal betekent, en het is het enige dat een platte takenlijst je nooit kan vertellen.',
    },
    'export-backup': {
      text: 'Exporteren is de echte back-up',
      supporting:
        'Alles staat in deze browser. Sitegegevens wissen veegt het weg, en Safari verwijdert opslag van sites die je een week niet gebruikt. Importeren voegt samen, dus een export is nooit iets om bang voor te zijn.',
    },
    'review-cadence': {
      text: 'Eén keer per week is het idee',
      supporting:
        'De ronde is wat je de lijsten ertussenin laat vertrouwen. Afronden legt de datum vast, en de zijbalk begint na zeven dagen te porren.',
    },
  },

  recovered: {
    heading: 'Teruggehaalde gegevens',
    savedAt: (date) =>
      date === null
        ? 'op een onbekend moment'
        : `op ${date.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })}`,
    rowTitle: (when) => `Apart gezet ${when}`,
    detail: (size, reason) =>
      `${reason === 'unreadable' ? 'Gegevens die niet te lezen waren' : 'Kopie van voor een upgrade'} (${Math.max(1, Math.round(size / 1024))} kB)`,
    download: 'Downloaden',
    downloadLabel: (when) => `Download de kopie die ${when} apart is gezet`,
    deleteLabel: (when) => `Verwijder de kopie die ${when} apart is gezet`,
    deleted: 'Teruggehaalde kopie verwijderd.',
    gone: 'Deze kopie staat niet meer in deze browser.',
  },

  problem(p) {
    switch (p.kind) {
      case 'unreadable-items':
        return {
          text: `${p.count} opgeslagen item(s) waren niet te lezen en zijn weggelaten.`,
          supporting: `Er is een kopie bewaard in deze browser onder "${p.copyKey}".`,
        };
      case 'corrupt':
        return p.leftInLegacy
          ? {
              text: 'Je opgeslagen gegevens waren niet te lezen.',
              supporting: 'Ze zijn onaangeroerd gelaten in deze browser (gtd:items).',
            }
          : {
              text: 'Je opgeslagen gegevens waren niet te lezen.',
              supporting: `Er is een kopie bewaard in deze browser onder "${p.copyKey}".`,
            };
      case 'paused': {
        const cause = {
          corrupt: 'Je opgeslagen gegevens waren niet te lezen, en er past geen veiligheidskopie in de browseropslag.',
          'unreadable-items':
            'Sommige opgeslagen items waren niet te lezen, en er past geen veiligheidskopie in de browseropslag.',
          migration: 'Je gegevens moeten worden bijgewerkt, en er past geen veiligheidskopie in de browseropslag.',
        }[p.cause];
        return {
          text: cause,
          supporting: 'Opslaan is gepauzeerd zodat er niets wordt overschreven. Download de gegevens eerst en hervat daarna.',
        };
      }
      case 'newer':
        return {
          text: `Je gegevens zijn opgeslagen door een nieuwere versie van deze app (schema ${p.version}).`,
          supporting: 'Deze versie kan ze niet lezen, dus hier wordt niets opgeslagen. Herlaad zodra de nieuwere versie draait.',
        };
      case 'unavailable':
        return {
          text: 'Browseropslag is niet beschikbaar, dus er wordt niets opgeslagen.',
          supporting: 'Exporteer voordat je dit tabblad sluit.',
        };
      case 'save-failed':
        return {
          text: 'Je laatste wijziging kon niet worden opgeslagen.',
          supporting: 'De browseropslag is misschien vol of geblokkeerd. Exporteer je gegevens nu, zodat er niets verloren gaat.',
        };
    }
  },
  problemActions: { download: 'Gegevens downloaden', resume: 'Opslaan hervatten', export: 'Exporteren' },

  demo: {
    title: 'Demo',
    try: 'Bekijk een demo',
    running: 'Demogegevens',
    explain: 'Een voorbeeldsysteem om in rond te klikken. Je eigen lijsten blijven onaangeroerd.',
    leave: 'Demo verlaten',
    reset: 'Demo opnieuw beginnen',
    content: {
      inboxRoof: 'Iets wat Ruud zei over het dak',
      inboxSlides: 'Slides voor de sessie van donderdag',
      inboxPermit: 'Parkeervergunning verlengen',
      nextNotary: 'Notaris mailen over de akte',
      nextRehearsal: 'Oefenruimte reserveren',
      waitingQuote: 'Offerte van de loodgieter',
      somedaySailing: 'Leren zeilen',
      doneTaxes: 'Belastingaangifte doen',
      doneBikeLight: 'Fietslamp maken',
      donePassport: 'Paspoort verlengen',
      projectHouse: 'Huis verkocht',
      projectGarden: 'Tuin klaar voor de zomer',
      contextErrands: 'boodschappen',
      contextEmail: 'e-mail',
      contextCalls: 'bellen',
    },
  },

  filter: {
    label: 'Filter op context',
    all: 'Alles',
    empty: (label: string) => `Niets met @${label} op deze lijst.`,
  },

  search: {
    title: 'Zoeken',
    label: 'Zoek in je lijsten',
    placeholder: 'Een woord, of @context',
    clear: 'Zoekopdracht wissen',
    submit: 'Zoeken',
    prompt: 'Typ een woord uit de titel. Een @tag beperkt het tot één context.',
    nothing: (query: string) => `Niets komt overeen met “${query}”.`,
    actions: 'Acties',
    projects: 'Projecten',
    where: (list: string, context?: string) => (context === undefined ? list : `${list} · @${context}`),
    projectWhere: (open: number) => (open === 1 ? '1 open actie' : `${open} open acties`),
  },

  settings: {
    title: 'Instellingen',
    backup: 'Back-up',
  },

  appearance: {
    title: 'Weergave',
    explain: 'Allebei worden bij je gegevens bewaard, dus ze overleven een herlaadbeurt en reizen mee in een back-up.',
    theme: 'Thema',
    system: 'Systeem',
    light: 'Licht',
    dark: 'Donker',
    language: 'Taal',
    english: 'English',
    dutch: 'Nederlands',
    listArrowHint: 'Gebruik de pijltjestoetsen om door de lijst te navigeren.',
  },
};

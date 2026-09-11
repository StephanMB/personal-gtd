import { loadItems, saveItems, createItem, actionButtons, type Item, type Status } from './gtd';

const SECTIONS: { status: Status; label: string }[] = [
  { status: 'inbox', label: 'Inbox' },
  { status: 'next', label: 'Next actions' },
  { status: 'waiting', label: 'Waiting for' },
  { status: 'someday', label: 'Someday / maybe' },
  { status: 'done', label: 'Done' },
];

let items: Item[] = loadItems();

function persist() {
  saveItems(items);
}

function moveItem(id: string, status: Status) {
  const item = items.find((i) => i.id === id);
  if (!item) return;
  item.status = status;
  item.updatedAt = Date.now();
  persist();
  render();
}

function deleteItem(id: string) {
  items = items.filter((i) => i.id !== id);
  persist();
  render();
}

function renderItem(item: Item): HTMLLIElement {
  const li = document.createElement('li');
  li.className = 'item';

  const title = document.createElement('span');
  title.className = 'item-title';
  title.textContent = item.title;
  li.appendChild(title);

  if (item.context) {
    const badge = document.createElement('span');
    badge.className = 'context-badge';
    badge.textContent = `@${item.context}`;
    li.appendChild(badge);
  }

  const actions = document.createElement('span');
  actions.className = 'item-actions';

  for (const action of actionButtons(item)) {
    const btn = document.createElement('button');
    btn.textContent = action.label;
    btn.addEventListener('click', () => moveItem(item.id, action.status));
    actions.appendChild(btn);
  }

  const del = document.createElement('button');
  del.textContent = '✕';
  del.className = 'delete-btn';
  del.setAttribute('aria-label', `Delete "${item.title}"`);
  del.addEventListener('click', () => deleteItem(item.id));
  actions.appendChild(del);

  li.appendChild(actions);
  return li;
}

function render() {
  const root = document.getElementById('gtd-root');
  if (!root) return;
  root.innerHTML = '';

  for (const section of SECTIONS) {
    const sectionItems = items
      .filter((i) => i.status === section.status)
      .sort((a, b) => b.updatedAt - a.updatedAt);

    const details = document.createElement('details');
    details.open = section.status !== 'done';

    const summary = document.createElement('summary');
    summary.textContent = `${section.label} (${sectionItems.length})`;
    details.appendChild(summary);

    const list = document.createElement('ul');
    list.className = 'item-list';
    if (sectionItems.length === 0) {
      const empty = document.createElement('li');
      empty.className = 'empty';
      empty.textContent = 'Nothing here.';
      list.appendChild(empty);
    } else {
      for (const item of sectionItems) {
        list.appendChild(renderItem(item));
      }
    }
    details.appendChild(list);
    root.appendChild(details);
  }
}

function setupCaptureForm() {
  const form = document.getElementById('capture-form') as HTMLFormElement | null;
  const input = document.getElementById('capture-input') as HTMLInputElement | null;
  if (!form || !input) return;

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const value = input.value.trim();
    if (!value) return;
    items.push(createItem(value));
    persist();
    input.value = '';
    render();
  });
}

setupCaptureForm();
render();

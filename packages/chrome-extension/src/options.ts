import type { ProjectEntry, RelatedProjectGroups } from './config.js';
import {
  loadRelatedProjectGroups,
  saveRelatedProjectGroups,
} from './config.js';

const groupsContainer = document.getElementById('groups')!;
const addGroupBtn = document.getElementById('add-group')!;
const saveBtn = document.getElementById('save')!;
const statusEl = document.getElementById('status')!;

function createEntryRow(
  entry: ProjectEntry,
  onRemove: () => void,
): HTMLElement {
  const row = document.createElement('div');
  row.className = 'entry';

  const nameInput = document.createElement('input');
  nameInput.className = 'name-input';
  nameInput.placeholder = 'Project name';
  nameInput.value = entry.name;
  nameInput.dataset.field = 'name';

  const idInput = document.createElement('input');
  idInput.className = 'id-input';
  idInput.placeholder = 'Project ID (GUID)';
  idInput.value = entry.id;
  idInput.dataset.field = 'id';

  const removeBtn = document.createElement('button');
  removeBtn.className = 'danger';
  removeBtn.textContent = '×';
  removeBtn.title = 'Remove entry';
  removeBtn.addEventListener('click', onRemove);

  row.append(nameInput, idInput, removeBtn);
  return row;
}

function createGroupEl(
  entries: ProjectEntry[],
  groupIndex: number,
  onRemoveGroup: () => void,
): HTMLElement {
  const group = document.createElement('div');
  group.className = 'group';
  group.dataset.group = String(groupIndex);

  const header = document.createElement('div');
  header.className = 'group-header';
  const label = document.createElement('span');
  label.textContent = `Group ${groupIndex + 1}`;
  const removeGroupBtn = document.createElement('button');
  removeGroupBtn.className = 'danger';
  removeGroupBtn.textContent = 'Remove group';
  removeGroupBtn.addEventListener('click', onRemoveGroup);
  header.append(label, removeGroupBtn);
  group.appendChild(header);

  const entriesContainer = document.createElement('div');
  entriesContainer.className = 'entries';

  for (const entry of entries) {
    const row = createEntryRow(entry, () => {
      row.remove();
    });
    entriesContainer.appendChild(row);
  }

  group.appendChild(entriesContainer);

  const addEntryBtn = document.createElement('button');
  addEntryBtn.textContent = '+ Add project';
  addEntryBtn.addEventListener('click', () => {
    const row = createEntryRow({ id: '', name: '' }, () => {
      row.remove();
    });
    entriesContainer.appendChild(row);
  });
  group.appendChild(addEntryBtn);

  return group;
}

function render(groups: RelatedProjectGroups): void {
  groupsContainer.innerHTML = '';
  groups.forEach((entries, i) => {
    const el = createGroupEl(entries, i, () => {
      el.remove();
      reindexGroups();
    });
    groupsContainer.appendChild(el);
  });
}

function reindexGroups(): void {
  const groupEls = groupsContainer.querySelectorAll('.group');
  groupEls.forEach((el, i) => {
    el.dataset.group = String(i);
    const label = el.querySelector('.group-header span');
    if (label) label.textContent = `Group ${i + 1}`;
  });
}

function collectGroups(): RelatedProjectGroups {
  const groups: RelatedProjectGroups = [];
  for (const groupEl of groupsContainer.querySelectorAll('.group')) {
    const entries: ProjectEntry[] = [];
    for (const row of groupEl.querySelectorAll('.entry')) {
      const name =
        (
          row.querySelector('[data-field="name"]') as HTMLInputElement
        )?.value.trim() ?? '';
      const id =
        (
          row.querySelector('[data-field="id"]') as HTMLInputElement
        )?.value.trim() ?? '';
      if (name || id) entries.push({ id, name });
    }
    if (entries.length > 0) groups.push(entries);
  }
  return groups;
}

addGroupBtn.addEventListener('click', () => {
  const idx = groupsContainer.querySelectorAll('.group').length;
  const el = createGroupEl(
    [
      { id: '', name: '' },
      { id: '', name: '' },
    ],
    idx,
    () => {
      el.remove();
      reindexGroups();
    },
  );
  groupsContainer.appendChild(el);
});

saveBtn.addEventListener('click', async () => {
  const groups = collectGroups();
  await saveRelatedProjectGroups(groups);
  statusEl.classList.add('show');
  setTimeout(() => statusEl.classList.remove('show'), 2000);
});

// Load on startup
loadRelatedProjectGroups().then(render);

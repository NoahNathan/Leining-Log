import { renderHome } from './views/home.js';
import { renderSearch } from './views/search.js';
import { renderCompare } from './views/compare.js';

const VIEWS = {
  home: { label: 'This Week', render: renderHome },
  search: { label: 'Search', render: renderSearch },
  compare: { label: 'Compare', render: renderCompare },
};

const tabsHost = document.getElementById('tabs');
const viewHost = document.getElementById('view');

function currentTab() {
  const hash = location.hash.replace('#', '');
  return VIEWS[hash] ? hash : 'home';
}

function buildTabs() {
  tabsHost.innerHTML = '';
  for (const [key, view] of Object.entries(VIEWS)) {
    const btn = document.createElement('button');
    btn.className = 'tab-btn';
    btn.textContent = view.label;
    btn.dataset.tab = key;
    btn.addEventListener('click', () => { location.hash = key; });
    tabsHost.append(btn);
  }
}

async function route() {
  const tab = currentTab();
  [...tabsHost.children].forEach((b) => b.classList.toggle('active', b.dataset.tab === tab));
  viewHost.innerHTML = '';
  const loading = document.createElement('p');
  loading.className = 'muted';
  loading.textContent = 'Loading…';
  viewHost.append(loading);
  try {
    await VIEWS[tab].render(viewHost);
  } catch (err) {
    console.error(err);
    viewHost.innerHTML = '';
    const p = document.createElement('p');
    p.className = 'error';
    p.textContent = `Something went wrong loading this view: ${err.message}`;
    viewHost.append(p);
  }
}

buildTabs();
window.addEventListener('hashchange', route);
route();

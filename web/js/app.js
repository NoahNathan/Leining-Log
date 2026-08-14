import { el } from './util.js';
import { renderHome } from './views/home.js';
import { renderSearch } from './views/search.js';
import { renderCompare } from './views/compare.js';
import { renderAccount } from './views/account.js';
import { renderGabbai } from './views/gabbai.js';
import { renderHowItWorks } from './views/howitworks.js';
import { renderContact } from './views/contact.js';
import { renderParshaPermalink, renderChagPermalink } from './views/permalink.js';
import { initAccountBanner } from './accountBanner.js';

const VIEWS = {
  home: { label: 'This Week', render: renderHome },
  search: { label: 'Search', render: renderSearch },
  compare: { label: 'Compare', render: renderCompare },
  account: { label: 'My Leining', render: renderAccount },
  gabbai: { label: 'Gabbai Mode', badge: 'Beta', render: renderGabbai },
  howitworks: { label: 'How It Works', render: renderHowItWorks },
  contact: { label: 'Contact Us', render: renderContact },
};

const tabsHost = document.getElementById('tabs');
const viewHost = document.getElementById('view');

// Parsha/chag permalinks (#parsha/<id>, #chag/<id>) render directly rather
// than through a tab, so a single URL can be shared straight to that reading.
function parseHash() {
  const hash = location.hash.replace('#', '');
  let m = hash.match(/^parsha\/(.+)$/);
  if (m) return { type: 'parsha', id: decodeURIComponent(m[1]) };
  m = hash.match(/^chag\/(.+)$/);
  if (m) return { type: 'chag', id: decodeURIComponent(m[1]) };
  // Supabase's magic-link redirect lands back here with the session tokens
  // in the URL hash (e.g. #access_token=...&type=magiclink). Route straight
  // to My Leining without touching location.hash ourselves -- the Supabase
  // client still needs to read those tokens out of it on this same load.
  if (/access_token=/.test(hash)) return { type: 'tab', tab: 'account' };
  return { type: 'tab', tab: VIEWS[hash] ? hash : 'home' };
}

function buildTabs() {
  tabsHost.innerHTML = '';
  for (const [key, view] of Object.entries(VIEWS)) {
    const btn = document.createElement('button');
    btn.className = 'tab-btn';
    btn.append(view.badge ? view.label + ' ' : view.label);
    if (view.badge) btn.append(el('span', { class: 'tag combined-tag' }, view.badge));
    btn.dataset.tab = key;
    btn.addEventListener('click', () => { location.hash = key; });
    tabsHost.append(btn);
  }
}

async function route() {
  const parsed = parseHash();
  const activeTab = parsed.type === 'tab' ? parsed.tab : 'search';
  [...tabsHost.children].forEach((b) => b.classList.toggle('active', b.dataset.tab === activeTab));
  viewHost.innerHTML = '';
  const loading = document.createElement('p');
  loading.className = 'muted';
  loading.textContent = 'Loading…';
  viewHost.append(loading);
  try {
    if (parsed.type === 'parsha') await renderParshaPermalink(viewHost, parsed.id);
    else if (parsed.type === 'chag') await renderChagPermalink(viewHost, parsed.id);
    else await VIEWS[parsed.tab].render(viewHost);
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
initAccountBanner();

import { el, displayParshaName, todayISO, formatDateLong, scoreColor } from '../util.js';
import { isConfigured, onAuthChange } from '../auth.js';
import { listAllParshiotForSearch, findByDate, computeTorahProgress, computeMinyanCoverage } from '../data.js';
import {
  listMyMinyanim, createMinyan, deleteMinyan,
  listMinyanMembers, inviteMember, removeMember,
  listMyPendingMinyanInvites, respondToMinyanInvite,
  assignReading, listMinyanAssignments, cancelAssignment,
  listMyPendingReadingInvites, respondToReadingAssignment,
  getSharedLogsForMinyan,
} from '../gabbai.js';

const BOOK_ORDER = ['Genesis', 'Exodus', 'Leviticus', 'Numbers', 'Deuteronomy'];

const INVITE_MESSAGES = {
  invited: 'Invitation sent.',
  already_member: "They're already invited or already a member.",
  not_found: 'No account found for that email -- they need to sign up first.',
  not_authorized: "You don't have permission to invite to this minyan.",
  cannot_invite_self: "You can't invite yourself.",
};
const ASSIGN_MESSAGES = {
  assigned: 'Assigned!',
  not_authorized: "You don't have permission to assign for this minyan.",
  not_accepted_member: 'That person is not an accepted member of this minyan.',
  already_assigned: 'Already assigned for that date.',
  date_in_past: 'That date is in the past.',
};

let unsubscribeAuth = null;
let selectedMinyanId = null;

function ordinal(n) {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

export async function renderGabbai(container) {
  container.innerHTML = '';
  container.append(el('div', { class: 'view-heading' }, [
    el('h1', {}, ['Gabbai Mode ', el('span', { class: 'tag combined-tag' }, 'Beta')]),
    el('p', { class: 'muted' }, 'Organize a leining rotation, see where your group\'s coverage is thin, and line people up for upcoming weeks.'),
  ]));

  if (!isConfigured) {
    container.append(el('div', { class: 'notice' }, [
      'Account storage isn\'t configured yet. See the "Account & progress tracking" section of ',
      el('code', {}, 'README.md'),
      ' for setup steps.',
    ]));
    return;
  }

  const body = el('div', { class: 'view-body' }, [el('p', { class: 'muted' }, 'Loading…')]);
  container.append(body);

  if (unsubscribeAuth) unsubscribeAuth();
  unsubscribeAuth = await onAuthChange((user) => {
    if (user) renderLoggedIn(body, user);
    else renderLoggedOut(body);
  });
}

function renderLoggedOut(body) {
  body.innerHTML = '';
  body.append(el('div', { class: 'notice' }, [
    'Sign in on the ',
    el('a', { href: '#account' }, 'My Leining'),
    ' tab to use Gabbai Mode -- it requires an account, both to run a minyan and to be invited into one.',
  ]));
}

async function renderLoggedIn(body, user) {
  body.innerHTML = '';
  body.append(el('p', { class: 'muted' }, 'Loading…'));

  const [minyanInvites, readingInvites, myMinyanim, allParshiot] = await Promise.all([
    listMyPendingMinyanInvites(user.id),
    listMyPendingReadingInvites(user.id),
    listMyMinyanim(user.id),
    listAllParshiotForSearch(),
  ]);

  const refresh = () => renderLoggedIn(body, user);

  const selected = myMinyanim.find((m) => m.id === selectedMinyanId);
  if (!selected) selectedMinyanId = null;
  const detailNode = selected ? await buildMinyanDetail(selected, allParshiot, refresh) : null;

  body.innerHTML = '';
  body.append(renderInvitationsCard(minyanInvites, readingInvites, allParshiot, refresh));
  body.append(renderMinyanimCard(user, myMinyanim, refresh));
  if (detailNode) body.append(detailNode);
}

function renderInvitationsCard(minyanInvites, readingInvites, allParshiot, onChanged) {
  const card = el('div', { class: 'card subcard' }, [el('h3', {}, 'Your invitations')]);
  if (!minyanInvites.length && !readingInvites.length) {
    card.append(el('p', { class: 'muted small' }, 'No pending invitations.'));
    return card;
  }
  const parshaById = new Map(allParshiot.map((p) => [p.id, p]));

  for (const inv of minyanInvites) {
    card.append(el('div', { class: 'log-row' }, [
      el('div', {}, [
        el('span', { class: 'log-parsha' }, inv.minyanim ? inv.minyanim.name : 'A minyan'),
        el('span', { class: 'muted small' }, ' invited you to join their leining rotation'),
      ]),
      el('div', { class: 'subcard-actions' }, [
        el('button', {
          class: 'btn-primary', type: 'button',
          onclick: async () => { await respondToMinyanInvite(inv.id, true); onChanged(); },
        }, 'Accept'),
        el('button', {
          class: 'btn-share', type: 'button',
          onclick: async () => { await respondToMinyanInvite(inv.id, false); onChanged(); },
        }, 'Decline'),
      ]),
    ]));
  }

  for (const inv of readingInvites) {
    const p = parshaById.get(inv.parsha_id);
    const aliyahSelect = el('select', { class: 'text-input' }, [el('option', { value: 'ALL' }, 'Whole parsha')]);
    if (p) {
      for (const a of p.aliyot) aliyahSelect.append(el('option', { value: String(a.aliyah) }, ordinal(a.aliyah) + ' aliyah'));
      if (p.maftir) aliyahSelect.append(el('option', { value: 'M' }, 'Maftir'));
    }
    card.append(el('div', { class: 'log-row' }, [
      el('div', {}, [
        el('span', { class: 'log-parsha' }, (inv.minyanim ? inv.minyanim.name : 'A minyan') + ': '),
        el('span', {}, `${displayParshaName(inv.parsha_id)} — ${formatDateLong(inv.reading_date)}`),
      ]),
      el('div', { class: 'subcard-actions' }, [
        aliyahSelect,
        el('button', {
          class: 'btn-primary', type: 'button',
          onclick: async () => { await respondToReadingAssignment(inv.id, true, aliyahSelect.value); onChanged(); },
        }, 'Accept'),
        el('button', {
          class: 'btn-share', type: 'button',
          onclick: async () => { await respondToReadingAssignment(inv.id, false); onChanged(); },
        }, 'Decline'),
      ]),
    ]));
  }
  return card;
}

function renderMinyanimCard(user, myMinyanim, onChanged) {
  const nameInput = el('input', { type: 'text', class: 'text-input', placeholder: 'Minyan name (e.g. Shabbat morning)', required: true });
  const createForm = el('form', {
    class: 'search-row',
    onsubmit: async (e) => {
      e.preventDefault();
      if (!nameInput.value.trim()) return;
      const row = await createMinyan(user.id, nameInput.value.trim());
      selectedMinyanId = row.id;
      onChanged();
    },
  }, [nameInput, el('button', { class: 'btn-primary', type: 'submit' }, '+ New minyan')]);

  const card = el('div', { class: 'card subcard' }, [
    el('div', { class: 'subcard-heading-row' }, [el('h3', {}, 'Your minyanim'), createForm]),
  ]);

  if (!myMinyanim.length) {
    card.append(el('p', { class: 'muted small' }, "You don't run any minyanim yet -- create one above."));
    return card;
  }

  card.append(el('div', { class: 'toggle-group' }, myMinyanim.map((m) => el('button', {
    class: `toggle-btn ${selectedMinyanId === m.id ? 'active' : ''}`,
    type: 'button',
    onclick: () => { selectedMinyanId = m.id; onChanged(); },
  }, m.name))));

  if (selectedMinyanId) {
    card.append(el('button', {
      class: 'btn-share', type: 'button',
      onclick: async () => { await deleteMinyan(selectedMinyanId); selectedMinyanId = null; onChanged(); },
    }, 'Delete this minyan'));
  }
  return card;
}

async function buildMinyanDetail(minyan, allParshiot, onChanged) {
  const members = await listMinyanMembers(minyan.id);
  const accepted = members.filter((m) => m.status === 'accepted');
  const acceptedIds = accepted.map((m) => m.leiner_user_id);
  const [logs, assignments] = await Promise.all([
    getSharedLogsForMinyan(acceptedIds),
    listMinyanAssignments(minyan.id),
  ]);

  const wrap = el('div');
  wrap.append(await renderCoverageCard(minyan, accepted, logs));
  wrap.append(renderMembersCard(minyan, members, onChanged));
  wrap.append(renderScheduleCard(minyan, accepted, assignments, allParshiot, onChanged));
  return wrap;
}

async function renderCoverageCard(minyan, acceptedMembers, logs) {
  const card = el('div', { class: 'card subcard' }, [el('h3', {}, `Coverage — ${minyan.name}`)]);
  if (!acceptedMembers.length) {
    card.append(el('p', { class: 'muted small' }, 'No accepted members yet -- invite people below.'));
    return card;
  }

  const logsByUser = new Map();
  for (const row of logs) {
    if (!logsByUser.has(row.user_id)) logsByUser.set(row.user_id, []);
    logsByUser.get(row.user_id).push(row);
  }

  card.append(el('h4', { class: 'book-heading' }, 'Leiners'));
  for (const m of acceptedMembers) {
    const progress = await computeTorahProgress(logsByUser.get(m.leiner_user_id) || []);
    card.append(el('div', { class: 'minibar-row' }, [
      el('span', { class: 'minibar-label' }, m.leiner_email),
      el('div', { class: 'minibar-track' }, [
        el('div', { class: 'minibar-fill', style: `width:${Math.max(2, progress.percent)}%; background:var(--accent)` }),
      ]),
      el('span', { class: 'minibar-value' }, `${progress.percent}%`),
    ]));
  }

  const grid = await computeMinyanCoverage(logs);
  card.append(el('h4', { class: 'book-heading' }, 'Parsha coverage -- where the group has gaps'));
  for (const book of BOOK_ORDER) {
    const inBook = grid.filter((g) => g.book === book);
    if (!inBook.length) continue;
    for (const entry of inBook) {
      const gapScore = Math.max(0, Math.min(10, (100 - entry.percent) / 10));
      card.append(el('div', { class: 'minibar-row' }, [
        el('span', { class: 'minibar-label' }, displayParshaName(entry.englishName || entry.parshaId)),
        el('div', { class: 'minibar-track' }, [
          el('div', { class: 'minibar-fill', style: `width:${Math.max(2, entry.percent)}%; background:${scoreColor(gapScore)}` }),
        ]),
        el('span', { class: 'minibar-value' }, `${entry.percent}%`),
      ]));
    }
  }
  return card;
}

function renderMembersCard(minyan, members, onChanged) {
  const card = el('div', { class: 'card subcard' }, [el('h3', {}, 'Members')]);

  const emailInput = el('input', { type: 'email', class: 'text-input', placeholder: 'leiner@example.com', required: true });
  const status = el('span', { class: 'muted small' }, '');
  const form = el('form', {
    class: 'search-row',
    onsubmit: async (e) => {
      e.preventDefault();
      if (!emailInput.value) return;
      status.textContent = 'Inviting…';
      status.className = 'muted small';
      try {
        const result = await inviteMember(minyan.id, emailInput.value);
        status.textContent = INVITE_MESSAGES[result] || result;
        if (result === 'invited') {
          emailInput.value = '';
          onChanged();
        } else {
          status.className = 'error small';
        }
      } catch (err) {
        status.textContent = err.message;
        status.className = 'error small';
      }
    },
  }, [emailInput, el('button', { class: 'btn-primary', type: 'submit' }, 'Invite'), status]);
  card.append(form);

  if (!members.length) {
    card.append(el('p', { class: 'muted small' }, 'No one invited yet.'));
    return card;
  }
  const list = el('div', { class: 'log-list' });
  for (const m of members) {
    list.append(el('div', { class: 'log-row' }, [
      el('div', {}, [
        el('span', { class: 'log-parsha' }, m.leiner_email),
        el('span', { class: 'tag' }, m.status),
      ]),
      el('button', {
        class: 'btn-share', type: 'button', title: 'Remove',
        onclick: async () => { await removeMember(m.id); onChanged(); },
      }, '✕'),
    ]));
  }
  card.append(list);
  return card;
}

function renderScheduleCard(minyan, acceptedMembers, assignments, allParshiot, onChanged) {
  const card = el('div', { class: 'card subcard' }, [el('h3', {}, 'Schedule a reading')]);

  if (!acceptedMembers.length) {
    card.append(el('p', { class: 'muted small' }, 'Get at least one accepted member before scheduling.'));
  } else {
    const dateInput = el('input', { type: 'date', class: 'text-input', min: todayISO() });
    const memberSelect = el('select', { class: 'text-input' }, acceptedMembers.map((m) =>
      el('option', { value: m.leiner_user_id }, m.leiner_email)
    ));
    const assignBtn = el('button', { class: 'btn-primary', type: 'submit', disabled: true }, 'Assign');
    const preview = el('p', { class: 'muted small' }, '');
    const status = el('span', { class: 'muted small' }, '');
    let resolvedParshaId = null;

    async function refreshPreview() {
      resolvedParshaId = null;
      preview.textContent = '';
      assignBtn.disabled = true;
      if (!dateInput.value) return;
      const rows = await findByDate(dateInput.value, 'diaspora');
      const parshaRow = rows.find((r) => r.type === 'parsha');
      if (parshaRow) {
        resolvedParshaId = parshaRow.parshaId;
        preview.textContent = `Reading: ${displayParshaName(parshaRow.parshaId)}`;
        assignBtn.disabled = false;
      } else {
        preview.textContent = 'No weekly parsha reading on this date.';
      }
    }
    dateInput.addEventListener('change', refreshPreview);

    const form = el('form', {
      class: 'search-row',
      onsubmit: async (e) => {
        e.preventDefault();
        if (!resolvedParshaId) return;
        status.textContent = 'Assigning…';
        status.className = 'muted small';
        try {
          const result = await assignReading(minyan.id, memberSelect.value, dateInput.value, resolvedParshaId, 'diaspora');
          status.textContent = ASSIGN_MESSAGES[result] || result;
          if (result === 'assigned') onChanged();
          else status.className = 'error small';
        } catch (err) {
          status.textContent = err.message;
          status.className = 'error small';
        }
      },
    }, [dateInput, memberSelect, assignBtn, status]);
    card.append(form, preview);
  }

  if (assignments.length) {
    const byUser = new Map(acceptedMembers.map((m) => [m.leiner_user_id, m.leiner_email]));
    const list = el('div', { class: 'log-list' });
    for (const a of assignments) {
      list.append(el('div', { class: 'log-row' }, [
        el('div', {}, [
          el('span', { class: 'log-parsha' }, displayParshaName(a.parsha_id)),
          el('span', { class: 'muted small' }, ` — ${formatDateLong(a.reading_date)} — ${byUser.get(a.leiner_user_id) || 'former member'}`),
          el('span', { class: 'tag' }, a.status),
        ]),
        (a.status === 'pending') ? el('button', {
          class: 'btn-share', type: 'button', title: 'Cancel',
          onclick: async () => { await cancelAssignment(a.id); onChanged(); },
        }, '✕') : null,
      ]));
    }
    card.append(el('h4', { class: 'book-heading' }, 'Upcoming assignments'), list);
  }
  return card;
}

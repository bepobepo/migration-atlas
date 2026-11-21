(() => {
  const get = id => document.getElementById(id);
  const picker = get('research-country');
  const period = get('period');
  const formatted = new Intl.NumberFormat('en', {signDisplay: 'exceptZero'});
  const cell = (row, tag, content) => {
    const td = document.createElement(tag);
    td.append(content);
    row.append(td);
    return td;
  };
  async function load() {
    const datasets = ['driver-guide', 'events', 'countries'];
    const [guide, events, atlas] = await Promise.all(datasets.map(async name => {
      const response = await fetch(`data/${name}.json`, {cache: 'no-cache'});
      if (!response.ok) throw Error('Unavailable dataset');
      return response.json();
    }));
    const countries = guide.countries;
    for (const [code, row] of Object.entries(countries)) picker.add(new Option(row.name, code));
    function displayCountry(focus = false) {
      const code = window.location.hash.slice(1);
      const row = Object.hasOwn(countries, code) ? countries[code] : null;
      picker.value = row ? code : '';
      get('profile').hidden = !row;
      if (!row) return;
      get('ranking').open = false;
      const title = get('profile-name');
      title.textContent = row.name;
      const measure = row.periods[period.value];
      get('profile-total').textContent = `${period.value}–${guide.end} · Net migration ${formatted.format(measure.net)} · Rank ${measure.rank} of ${guide.universe}`;
      const relevant = events.filter(e => e.country === code || e.origin === code || e.destination === code);
      const list = get('profile-history');
      list.replaceChildren();
      for (const incoming of [true, false]) {
        const selected = relevant.filter(e => eventScope(e) === 'route'
          ? e[incoming ? 'destination' : 'origin'] === code
          : eventScope(e) === (incoming ? 'destination-country' : 'origin-country'));
        const matches = historyMatches(selected, {start: 2000, end: guide.end});
        const heading = document.createElement('h4');
        heading.textContent = incoming ? 'Moving into ' + row.name : 'Moving out of ' + row.name;
        const group = document.createElement('div');
        renderHistoryCards(group, matches, {start: 2000, end: guide.end, nameForCode: id => atlas[id].name,
          emptyMessage: 'This review has no sourced episode for this direction.'});
        list.append(heading, group);
      }
      if (focus) title.focus();
    }
    function displayRanking() {
      const start = period.value;
      const body = document.querySelector('tbody');
      body.replaceChildren();
      const order = Object.entries(countries).filter(([, c]) => c.periods[start].rank <= 40)
        .sort((a, b) => a[1].periods[start].rank - b[1].periods[start].rank);
      for (const [code, c] of order) {
        const tr = body.insertRow();
        cell(tr, 'td', c.periods[start].rank);
        const link = document.createElement('a');
        link.href = '#' + code;
        link.textContent = c.name;
        link.onclick = () => { if (location.hash === link.hash) displayCountry(true); };
        cell(tr, 'th', link).scope = 'row';
        cell(tr, 'td', formatted.format(c.periods[start].net));
      }
      get('rank-caption').textContent = `Cumulative net migration, ${start}–${guide.end} (people)`;
    }
    picker.onchange = () => { window.location.hash = picker.value; };
    period.onchange = () => { const open = get('ranking').open; displayRanking(); displayCountry(); get('ranking').open = open; };
    window.addEventListener('hashchange', () => displayCountry(true));
    get('guide-status').hidden = true;
    get('guide').hidden = false;
    displayRanking();
    displayCountry();
  }
  function failed() {
    const retry = document.createElement('button');
    retry.textContent = 'Retry';
    retry.onclick = () => { get('guide-status').textContent = 'Loading country research…'; load().catch(failed); };
    get('guide-status').replaceChildren('Country research could not be loaded. ', retry);
  }
  load().catch(failed);
})();

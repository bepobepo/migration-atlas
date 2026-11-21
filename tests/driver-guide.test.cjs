const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM } = require('jsdom');
const root = path.resolve(__dirname, '../dist');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const json = file => JSON.parse(read(file));

(async () => {
  const guide = json('data/driver-guide.json');
  const atlas = json('data/countries.json');
  const annual = json('data/national/net.json').countries;
  const events = json('data/events.json');
  const listed = Object.keys(atlas).filter(c => atlas[c].hasData);
  assert.equal(guide.universe, listed.length);
  for (const start of [2000, 2020]) {
    const rankings = listed.map(c => {
      let total = 0;
      for (let y = start; y <= 2024; y++) total += annual[c][y];
      return [c, total];
    }).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
    for (const [i, [c, net]] of rankings.entries()) {
      if (i < 40) assert.ok(guide.countries[c], c);
      if (guide.countries[c]) assert.deepEqual(guide.countries[c].periods[start], {rank: i + 1, net}, c);
    }
  }
  for (const c of Object.keys(guide.countries)) {
    assert.ok(events.some(e => e.end >= 2020 && (e.destination === c || (e.scope === 'destination-country' && e.country === c))), 'Incoming evidence for ' + c);
    assert.ok(events.some(e => e.end >= 2000 && (e.origin === c || (e.scope === 'origin-country' && e.country === c))), 'Outgoing evidence for ' + c);
  }
  for (const [index, e] of events.entries()) {
    assert.equal(e.id, index);
    assert.ok(e.start <= e.end && e.end <= 2024);
    assert.ok(new URL(e.source).protocol === 'https:');
    if (e.additionalSource) assert.ok(new URL(e.additionalSource).protocol === 'https:');
    for (const u of e.updates || []) assert.ok(u.year >= e.start && u.year <= e.end && u.text);
    if (e.scope === 'route') assert.ok(atlas[e.origin] && atlas[e.destination]);
    else assert.ok(atlas[e.country]);
  }
  const dom = new JSDOM(read('research.html'), {runScripts: 'outside-only', url: 'https://atlas.test/research.html#BLR'});
  const w = dom.window;
  const get = id => w.document.getElementById(id);
  let first = true;
  w.fetch = async url => {
    if (first) { first = false; throw Error('offline'); }
    return {ok: true, json: () => json(url)};
  };
  const flush = () => new Promise(resolve => setImmediate(resolve));
  w.eval(read('history.js'));
  w.eval(read('research.js'));
  await flush();
  get('guide-status').querySelector('button').click();
  await flush();
  assert.equal(get('profile-name').textContent, 'Belarus');
  assert.match(get('profile-total').textContent, /-82,061/);
  assert.match(get('profile-history').textContent, /56%.*59%/);
  assert.equal(get('ranking').open, false);
  assert.equal(w.document.querySelectorAll('tbody tr').length, 40);
  assert.equal(w.document.querySelectorAll('tbody a')[1].hash, '#SYR');
  get('period').value = '2000'; get('period').dispatchEvent(new w.Event('change'));
  assert.equal(w.document.querySelectorAll('tbody a')[1].hash, '#RUS');
  assert.match(get('profile-total').textContent, /-75,758/);
  w.location.hash = 'ISR'; w.dispatchEvent(new w.Event('hashchange'));
  assert.match(get('profile-history').textContent, /Law of Return/);
  assert.match(get('profile-history').textContent, /Thai workers/);
  w.location.hash = 'constructor'; w.dispatchEvent(new w.Event('hashchange'));
  assert.equal(get('profile').hidden, true);
  dom.window.close();
  console.log(`PASS both migration rankings, ${Object.keys(guide.countries).length} country profiles, chronology, sources, retries and country navigation`);
})().catch(error => { console.error(error); process.exitCode = 1; });

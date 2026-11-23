// From a host with React, React DOM, lucide-react, esbuild, PostCSS and an HTML parser installed:
// node path/to/check-history.mjs ./vendor/vehicles [--browser]
// In CI use --browser with CHROME_BIN pointing to Chrome or Chromium for the geometry assertions.
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {createRequire} from 'node:module';
import {mkdtempSync, readFileSync, rmSync, writeFileSync} from 'node:fs';
import {join, resolve} from 'node:path';
import {tmpdir} from 'node:os';
import {pathToFileURL} from 'node:url';

const source = resolve(process.argv.slice(2).find(arg => !arg.startsWith('--')) || '.');
const require = createRequire(resolve('package.json'));
const {buildSync} = require('esbuild');
const React = require('react');
const {renderToStaticMarkup} = require('react-dom/server');
const postcss = require('postcss');
let parseHtml;
try {
  ({parse: parseHtml} = require('node-html-parser'));
} catch {
  ({parse: parseHtml} = require('next/dist/compiled/node-html-parser'));
}

const css = readFileSync(join(source, 'vehicles.css'), 'utf8');
const rules = postcss.parse(css);
const card = parseHtml('<div class="vehicles-app"><section class="veh-panel veh-history"></section></div>');
const panel = card.querySelector('section');
let hasCardPadding = false;
rules.walkRules(rule => {
  if (!rule.nodes.some(node => node.type === 'decl' && node.prop.startsWith('padding'))) return;
  if (!card.querySelectorAll(rule.selector).includes(panel)) return;
  for (const node of rule.nodes) {
    if (node.type !== 'decl' || !/^padding(?:-(?:inline|inline-start|left))?$/.test(node.prop)) continue;
    if (rule.parent.type === 'root') hasCardPadding = true;
    assert.doesNotMatch(node.value, /^0(?:px|rem|em|%)?(?:\s+0(?:px|rem|em|%)?)*$/, 'Vehicle history card padding was reset to zero');
  }
});
assert.ok(hasCardPadding, 'Vehicle history must inherit card padding');

const temp = mkdtempSync(join(tmpdir(), 'vehicle-history-check-'));
try {
  const bundle = join(temp, 'records.cjs');
  buildSync({
    entryPoints: [join(source, 'Vehicles.tsx')], outfile: bundle,
    bundle: true, platform: 'node', format: 'cjs', jsx: 'automatic',
    loader: {'.css': 'empty'}, logLevel: 'silent', nodePaths: require.resolve.paths('react')
  });
  const {VehicleRecords} = require(bundle);
  const event = (id, kind, label, sourceId, day, extra = {}) => ({
    id, kind, label, source: sourceId, day, at:'2026-11-22T15:30:00Z', ...extra
  });
  const records = [
    event('p', 'payment', 'Payment accepted', 'rego', '2026-11-12', {amount: '480'}),
    event('x', 'expiry', 'Confirmed expiry', 'rego', '2027-11-30'),
    event('s', 'service', 'Scheduled service', 'work', '2026-11-18', {reading:'80000', unit:'km'}),
    event('f', 'followup', 'Replace cup holder', 'work', '')
  ];
  const files = ['rego','work','pending'].map(id => ({id, name: id === 'pending' ? 'FictionalLongFilename'.repeat(6) + '.pdf' : 'Vehicle note.txt'}));
  const vehicle = {history: records, files, evidence: []};
  const api = {file: id => '/evidence/' + id};
  const specs = {
    Home: ['f,s,x,p', 'rego,work,pending'], Registration: ['x,p', 'rego'],
    Maintenance: ['f', 'work'], Servicing: ['s', 'work']
  };
  const panels = [];
  for (const [section,[eventIds,sourceIds]] of Object.entries(specs)) {
    const markup = renderToStaticMarkup(React.createElement(VehicleRecords, {vehicle, section, api, canEdit: false}));
    const dom = parseHtml(markup);
    const table = dom.querySelector('table');
    assert.ok(table, section + ' must expose a history table');
    assert.deepEqual(table.querySelectorAll('th[scope="col"]').map(cell => cell.text), ['Date', 'Entry', 'Evidence']);
    const rows = table.querySelectorAll('tbody tr');
    const expected = eventIds.split(',').map(id => records.find(record => record.id === id));
    assert.equal(rows.length, expected.length, section + ' row count');
    for (const [i,row] of rows.entries()) {
      const entry = expected[i];
      assert.ok(row.text.includes(entry.label));
      assert.equal(row.querySelector('a').getAttribute('href'), api.file(entry.source));
      const link = row.querySelector('a');
      assert.ok((link.getAttribute('aria-label') || link.text).includes(link.text), 'Accessible name must include visible evidence text');
      if (entry.kind === 'service') assert.ok(row.text.includes('80,000 km'));
      if (entry.kind === 'payment') assert.ok(row.text.includes('$480.00'));
      if (entry.kind === 'expiry') assert.match(row.text, /Expires\s*30 Nov 2027/);
      if (!entry.day) assert.match(row.text, /Recorded\s*23 Nov 2026/);
    }
    const originals = dom.querySelectorAll('section').find(el => el.querySelector('h2')?.text === 'Original evidence');
    assert.deepEqual(originals.querySelectorAll('a').map(link => link.getAttribute('href')), sourceIds.split(',').map(api.file));
    if (section === 'Home') {
      const links = originals.querySelectorAll('a');
      assert.notEqual(links[0].text, links[1].text, 'Registration and service notes need distinguishable labels');
    }
    panels.push(markup);
  }
  console.log('PASS card padding, all four histories, linked originals, distinct note labels, dates, payment and meter formatting');

  if (process.argv.includes('--browser')) {
    const file = join(temp, 'geometry.html');
    const widths = [320,390,960];
    const html = widths.map(width => '<main style="width:'+width+'px"><div class="vehicles-app">'+panels.join('')+'</div></main>').join('');
    function checkGeometry() {
      const errors = [];
      for (const frame of document.querySelectorAll('main')) {
        const width = frame.clientWidth;
        for (const section of frame.querySelectorAll('section')) {
          const heading = section.querySelector('h2');
          const gap = heading.getBoundingClientRect().left - section.getBoundingClientRect().left;
          if (gap < 12 || section.scrollWidth > section.clientWidth + 1) errors.push(width + 'px: clipping or insufficient inset at ' + heading.textContent);
        }
        const row = frame.querySelector('tbody tr');
        if ((width < 400) !== (getComputedStyle(row).display === 'grid')) errors.push(width + 'px: history breakpoint');
      }
      document.querySelector('output').textContent = errors.length ? errors.join('; ') : 'PASS';
    }
    writeFileSync(file, '<!doctype html><meta charset="utf-8"><style>'+css+'</style>'+html+'<output></output><script>('+checkGeometry.toString()+')()</script>');
    const result = spawnSync(process.env.CHROME_BIN || 'chromium', [
      '--headless', '--disable-gpu', '--disable-background-networking', '--user-data-dir='+join(temp,'profile'),
      '--window-size=1200,900', '--dump-dom', pathToFileURL(file).href
    ], {encoding:'utf8', timeout:30000, maxBuffer:4*1024*1024});
    if (result.error) throw result.error;
    assert.equal(result.status, 0, 'Chromium launch failed: '+result.stderr.slice(-700));
    const outcome = parseHtml(result.stdout).querySelector('output')?.text;
    assert.equal(outcome, 'PASS', outcome);
    console.log('PASS rendered card insets, history breakpoints and horizontal overflow at 320px, 390px and 960px');
  }
} finally {
  rmSync(temp, {recursive:true, force:true});
}

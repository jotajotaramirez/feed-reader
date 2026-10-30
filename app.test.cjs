const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const source = fs.readFileSync(require('node:path').join(__dirname, 'app.js'), 'utf8');
const url = n => `https://welele.es/post/${n}`;
const entries = [4, 3, 2, 1].map(n => ({ link: url(n) }));
async function open(storage = new Map(), archive = entries) {
    const nodes = new Map();
    const element = id => {
        if (!nodes.has(id)) {
            const classes = new Set();
            nodes.set(id, { style: {}, hidden: id === 'reader-menu', clientHeight: 700,
                classList: { add: x => classes.add(x), remove: x => classes.delete(x), contains: x => classes.has(x) },
                events: {}, addEventListener(type, fn) { this.events[type] = fn; },
                setAttribute(key, value) { this[key] = value; }, removeAttribute(key) { delete this[key]; },
                querySelector() { return element('btn-favorite'); }, focus() {},
            });
        }
        return nodes.get(id);
    };
    const context = vm.createContext({ URL, console: { error() {}, warn() {} },
        window: { addEventListener() {} },
        document: { getElementById: element, querySelector: element, addEventListener() {} },
        localStorage: { getItem: k => storage.get(k) ?? null, setItem: (k,v) => storage.set(k,v), removeItem: k => storage.delete(k) },
        fetch: async () => ({ ok: true, json: async () => ({ items: archive }) }),
    });
    vm.runInContext(source, context);
    await new Promise(resolve => setImmediate(resolve));
    return { run: script => vm.runInContext(script, context), element, storage,
        click: id => element(id).events.click(),
        emit: (id, event) => element(id).events[event](),
        current: () => element('open-entry').href };
}
test('reload resumes a read entry and keeps previous/next navigation', async () => {
    const first = await open(); first.click('btn-start'); first.click('btn-next');
    assert.equal(first.current(), url(3));
    const again = await open(first.storage);
    assert.equal(again.current(), url(3));
    assert.equal(again.element('start-screen').classList.contains('active'), false);
    again.click('btn-prev'); assert.equal(again.current(), url(4));
    again.click('btn-next'); again.click('btn-next'); assert.equal(again.current(), url(2));
});
test('an explicit unread mark survives reload and retry', async () => {
    const first = await open(); first.click('btn-start'); first.click('btn-unread');
    const again = await open(first.storage);
    assert.equal(again.current(), url(4));
    assert.deepEqual(JSON.parse(again.storage.get('welele_read')), []);
    again.click('retry-entry');
    assert.deepEqual(JSON.parse(again.storage.get('welele_read')), []);
    assert.equal(again.element('btn-unread').classList.contains('unread-active'), true);
});
test('favorites are available from the menu and survive a reload in that view', async () => {
    const first = await open(); first.click('btn-start'); first.click('btn-favorite');
    first.click('menu-view-favorites');
    const again = await open(first.storage);
    assert.equal(again.current(), url(4));
    assert.equal(again.run('viewMode'), 'favorites');
    assert.equal(again.element('btn-favorite')['aria-pressed'], 'true');
    assert.deepEqual(JSON.parse(again.storage.get('welele_favorites')), [url(4)]);
});
test('new archive entries are added without moving the restored entry', async () => {
    const first = await open(); first.click('btn-start'); first.click('btn-next');
    const again = await open(first.storage, [{link:url(5)}, ...entries]);
    assert.equal(again.current(), url(3));
    again.click('btn-prev'); assert.equal(again.current(), url(4));
    again.click('btn-prev'); assert.equal(again.current(), url(5));
});
test('invalid saved state falls back to start without losing history or favorites', async () => {
    const store = new Map([['welele_session','broken json'], ['welele_read',JSON.stringify([url(4)])], ['welele_favorites',JSON.stringify([url(1)])]]);
    const page = await open(store);
    assert.equal(page.element('start-screen').classList.contains('active'), true);
    page.click('btn-start'); assert.equal(page.current(), url(3));
    assert.deepEqual(JSON.parse(store.get('welele_favorites')), [url(1)]);
});
test('home clears the resume pointer and starts from remaining unread entries', async () => {
    const page = await open(); page.click('btn-start'); page.click('menu-home');
    assert.equal(page.storage.has('welele_session'), false);
    page.click('btn-start'); assert.equal(page.current(), url(3));
});

test('the pressed arrow shows loading until the frame finishes', async () => {
    const page = await open();
    page.click('btn-start');
    page.emit('welele-frame', 'load');
    page.click('btn-next');

    assert.equal(page.current(), url(3));
    assert.equal(page.element('btn-next').classList.contains('is-loading'), true);
    assert.equal(page.element('btn-prev').classList.contains('is-loading'), false);
    assert.equal(page.element('btn-next')['aria-busy'], 'true');
    assert.equal(page.element('navigation-status').textContent, 'Cargando entrada siguiente');

    page.emit('welele-frame', 'load');
    assert.equal(page.element('btn-next').classList.contains('is-loading'), false);
    assert.equal(page.element('btn-next')['aria-busy'], undefined);
    assert.equal(page.element('btn-next')['aria-label'], 'Siguiente');
    assert.equal(page.element('navigation-status').textContent, '');

    page.click('btn-prev');
    assert.equal(page.element('btn-prev').classList.contains('is-loading'), true);
    assert.equal(page.element('btn-prev').disabled, true);
    assert.equal(page.element('navigation-status').textContent, 'Cargando entrada anterior');
    page.emit('welele-frame', 'error');
    assert.equal(page.element('btn-prev').classList.contains('is-loading'), false);
    assert.equal(page.element('btn-prev')['aria-label'], 'Anterior');
});

test('rapid navigation follows the most recently pressed arrow and keeps navigation working', async () => {
    const page = await open();
    page.click('btn-start');
    page.emit('welele-frame', 'load');
    page.click('btn-next');
    page.click('btn-next');
    page.click('btn-prev');

    assert.equal(page.current(), url(3));
    assert.equal(page.element('btn-prev').classList.contains('is-loading'), true);
    assert.equal(page.element('btn-next').classList.contains('is-loading'), false);
    page.emit('welele-frame', 'load');
    assert.equal(page.element('btn-prev').classList.contains('is-loading'), false);
});

test('home cancels the indicator and retry preserves it until the frame finishes', async () => {
    const page = await open();
    page.click('btn-start');
    page.emit('welele-frame', 'load');
    page.click('btn-next');
    page.click('retry-entry');
    assert.equal(page.element('btn-next').classList.contains('is-loading'), true);
    page.emit('welele-frame', 'load');
    assert.equal(page.element('btn-next').classList.contains('is-loading'), false);

    page.click('btn-next');
    page.click('menu-home');
    assert.equal(page.element('btn-next').classList.contains('is-loading'), false);
    assert.equal(page.element('navigation-status').textContent, '');
});

test('a late initial blank-frame load does not stop the navigation indicator', async () => {
    const page = await open();
    page.click('btn-start');
    page.click('btn-next');
    page.element('welele-frame').contentDocument = { URL: 'about:blank' };
    page.emit('welele-frame', 'load');
    assert.equal(page.element('btn-next').classList.contains('is-loading'), true);
    page.element('welele-frame').contentDocument = null;
    page.emit('welele-frame', 'load');
    assert.equal(page.element('btn-next').classList.contains('is-loading'), false);
});

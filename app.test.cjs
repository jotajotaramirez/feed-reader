const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const source = fs.readFileSync(require('node:path').join(__dirname, 'app.js'), 'utf8');
const url = n => `https://welele.es/post/${n}`;
const entries = [4, 3, 2, 1].map(n => ({ link: url(n) }));
async function open(storage = new Map(), archive = entries, options = {}) {
    const nodes = new Map();
    const windowEvents = {};
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
    element('welele-frame').contentWindow = {};
    const context = vm.createContext({ URL, AbortController, File, Blob, console: { error() {}, warn() {} },
        window: { addEventListener(type, fn) { windowEvents[type] = fn; } },
        document: { getElementById: element, querySelector: element, addEventListener() {} },
        localStorage: { getItem: k => storage.get(k) ?? null, setItem: (k,v) => storage.set(k,v), removeItem: k => storage.delete(k) },
        navigator: options.navigator || {},
        fetch: async (url, init) => url === 'welele_archive.json'
            ? { ok: true, json: async () => ({ items: archive }) }
            : options.fetchMedia(url, init),
    });
    vm.runInContext(source, context);
    await new Promise(resolve => setImmediate(resolve));
    return { run: script => vm.runInContext(script, context), element, storage,
        click: id => element(id).events.click(),
        emit: (id, event) => element(id).events[event](),
        message: (data, extra = {}) => windowEvents.message({
            origin: 'https://welele-reader-relay-20261021-jjr.s-ynth.chatgpt.site',
            source: element('welele-frame').contentWindow, data, ...extra,
        }),
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

const sampleVideo = {url:'https://64.media.tumblr.com/example/clip.mov',type:'video/mp4'};
const videoMessage = (postId, videos = [sampleVideo]) => ({type:'welele-video-sources',postId:String(postId),videos,hasVideo:true});

test('shares the actual video file through the system picker without a download', async () => {
    const shared = [];
    const requests = [];
    const page = await open(new Map(),entries,{
        navigator: {userActivation:{isActive:true},canShare: data => data.files.length === 1,share:async data => shared.push(data)},
        fetchMedia: async (url,init) => {
            requests.push({url,init});
            return new Response(new Uint8Array([0,1,2,3]),{headers:{'content-type':'video/mp4'}});
        },
    });
    page.click('btn-start');
    page.message(videoMessage(4));
    assert.equal(page.element('menu-share-video').disabled,false);
    await page.click('menu-share-video');
    assert.equal(requests.length,1);
    assert.match(requests[0].url,/\/share-video\?url=/);
    assert.equal(requests[0].init.credentials,'omit');
    assert.equal(shared.length,1);
    assert.equal(shared[0].url,undefined);
    assert.equal(shared[0].files[0].name,'welele-4-1.mp4');
    assert.equal(shared[0].files[0].type,'video/mp4');
    assert.deepEqual(new Uint8Array(await shared[0].files[0].arrayBuffer()),new Uint8Array([0,1,2,3]));
});

test('a slow preparation asks for a second tap and reuses the prepared file', async () => {
    const activation = {isActive:false};
    let requests = 0, shares = 0;
    const page = await open(new Map(),entries,{
        navigator:{userActivation:activation,canShare:()=>true,share:async()=>{shares++;}},
        fetchMedia:async()=>{requests++; return new Response(new Uint8Array([4,5]),{headers:{'content-type':'video/mp4'}});},
    });
    page.click('btn-start');
    page.message(videoMessage(4));
    await page.click('menu-share-video');
    assert.equal(shares,0);
    assert.match(page.element('share-video-status').textContent,/Pulsa de nuevo/);
    activation.isActive = true;
    await page.click('menu-share-video');
    assert.equal(requests,1);
    assert.equal(shares,1);
});

test('changing entries cancels preparation and ignores unrelated or stale messages', async () => {
    let shares = 0, aborted = false;
    const page = await open(new Map(),entries,{
        navigator:{userActivation:{isActive:true},canShare:()=>true,share:async()=>{shares++;}},
        fetchMedia:(url,init) => new Promise((resolve,reject) => {
            init.signal.addEventListener('abort',() => {aborted = true; reject(Object.assign(new Error('Aborted'),{name:'AbortError'}));});
        }),
    });
    page.click('btn-start');
    page.message(videoMessage(4),{origin:'https://attacker.test'});
    assert.equal(page.element('menu-share-video').disabled,true);
    page.message(videoMessage(4));
    const pending = page.click('menu-share-video');
    page.click('btn-next');
    await pending;
    assert.equal(aborted,true);
    assert.equal(shares,0);
    assert.equal(page.element('menu-share-video').disabled,true);
    page.message(videoMessage(4));
    assert.equal(page.element('menu-share-video').disabled,true);
});

test('unsupported video sources and browsers do not offer an accidental link share', async () => {
    const page = await open();
    page.click('btn-start');
    page.message(videoMessage(4,[{url:'https://youtube.com/watch?v=1',type:'video/mp4'}]));
    assert.equal(page.element('menu-share-video').disabled,true);
    assert.match(page.element('share-video-status').textContent,/no se puede compartir/i);
    page.message(videoMessage(4));
    assert.equal(page.element('menu-share-video').disabled,true);
    assert.match(page.element('share-video-status').textContent,/navegador no permite/i);
});

test('the requested video can be selected when a post contains more than one', async () => {
    const shared = [];
    const otherVideo = {url:'https://va.media.tumblr.com/example/other.webm',type:'video/webm'};
    const page = await open(new Map(),entries,{
        navigator:{userActivation:{isActive:true},canShare:()=>true,share:async data=>shared.push(data)},
        fetchMedia:async()=>new Response(new Uint8Array([7]),{headers:{'content-type':'video/webm'}}),
    });
    page.click('btn-start');
    page.message(videoMessage(4,[sampleVideo,otherVideo]));
    assert.equal(page.element('share-video-picker').hidden,false);
    page.element('share-video-select').value = '1';
    await page.click('menu-share-video');
    assert.equal(shared[0].files[0].name,'welele-4-2.webm');
    assert.equal(shared[0].files[0].type,'video/webm');
});

test('an expired share gesture can be retried without fetching the video again', async () => {
    let requests = 0, calls = 0;
    const page = await open(new Map(),entries,{
        navigator:{canShare:()=>true,share:async()=>{calls++; if (calls === 1) throw Object.assign(new Error('Expired'),{name:'NotAllowedError'});}},
        fetchMedia:async()=>{requests++; return new Response(new Uint8Array([1]));},
    });
    page.click('btn-start');
    page.message(videoMessage(4));
    await page.click('menu-share-video');
    assert.match(page.element('share-video-status').textContent,/Pulsa de nuevo/);
    await page.click('menu-share-video');
    assert.equal(requests,1);
    assert.equal(calls,2);
});

test('a failed preparation leaves the video available for another attempt', async () => {
    let calls = 0;
    const page = await open(new Map(),entries,{
        navigator:{userActivation:{isActive:true},canShare:()=>true,share:async()=>{}},
        fetchMedia:async()=>{calls++; return calls === 1 ? new Response('Too large',{status:413}) : new Response(new Uint8Array([1]));},
    });
    page.click('btn-start');
    page.message(videoMessage(4));
    await page.click('menu-share-video');
    assert.match(page.element('share-video-status').textContent,/100 MB/);
    assert.equal(page.element('menu-share-video').disabled,false);
    await page.click('menu-share-video');
    assert.equal(calls,2);
});

test('switching views at the same index clears a different entry video', async () => {
    const storage = new Map([['welele_favorites',JSON.stringify([url(1)])]]);
    const page = await open(storage,entries,{
        navigator:{canShare:()=>true,share:async()=>{}},
    });
    page.click('btn-start');
    page.message(videoMessage(4));
    assert.equal(page.element('menu-share-video').disabled,false);
    page.click('menu-view-favorites');
    assert.equal(page.current(),url(1));
    assert.equal(page.element('menu-share-video').disabled,true);
});

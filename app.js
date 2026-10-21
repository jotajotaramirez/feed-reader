const btnPrev = document.getElementById('btn-prev');
const btnNext = document.getElementById('btn-next');
const btnUnread = document.getElementById('btn-unread');
const unreadCountSpan = document.getElementById('unread-count');
const iframe = document.getElementById('welele-frame');
const loader = document.getElementById('loader');
const btnMenu = document.getElementById('btn-menu');
const readerMenu = document.getElementById('reader-menu');
const menuBackdrop = document.getElementById('menu-backdrop');
const startScreen = document.getElementById('start-screen');
const btnFavorite = document.getElementById('btn-favorite');
const menuFavorites = document.getElementById('menu-view-favorites');
const openEntry = document.getElementById('open-entry');
const retryEntry = document.getElementById('retry-entry');
const readerScroll = document.getElementById('reader-scroll');

const startPhrases = [
    "Tu dosis diaria de humor y entretenimiento.",
    "Vamos a partirnos el ojete.",
    "Estamos aquí por los loles.",
];

const ARCHIVE_URL = 'welele_archive.json';
// The public HTTPS relay serves the original page and its Disqus thread.
const FULL_PAGE_RELAY_ORIGIN = 'https://welele-reader-relay-20261021-jjr.s-ynth.chatgpt.site';

function getEntryFrameUrl(entry) {
    const url = new URL(entry.link);
    if (url.hostname !== 'welele.es' || !/^\/post\/\d+(?:\/|$)/.test(url.pathname)) {
        throw new Error('La entrada no tiene una URL válida de Welele.');
    }
    return FULL_PAGE_RELAY_ORIGIN + url.pathname + url.search;
}

function resizeEntryFrame() {
    iframe.style.height = readerScroll.clientHeight + 'px';
}

function resetEntryFrame() {
    readerScroll.scrollTop = 0;
    resizeEntryFrame();
}

window.addEventListener('resize', resizeEntryFrame);

let allEntries = [];
let feedEntries = [];
let currentIndex = -1;
let viewMode = 'feed';
const SESSION_KEY = 'welele_session';

function saveReadingSession() {
    if (!feedEntries[currentIndex]) return;
    try {
        localStorage.setItem(SESSION_KEY, JSON.stringify({
            version: 1, viewMode, currentUrl: feedEntries[currentIndex].link,
            urls: feedEntries.map(entry => entry.link),
        }));
    } catch (error) {
        console.warn('No se pudo guardar la sesión de lectura', error);
    }
}

function restoreReadingSession() {
    try {
        const saved = JSON.parse(localStorage.getItem(SESSION_KEY));
        if (!saved || saved.version !== 1 || !Array.isArray(saved.urls) ||
            !['feed', 'favorites'].includes(saved.viewMode)) return false;
        const entriesByUrl = new Map(allEntries.map(entry => [entry.link, entry]));
        let urls = [...new Set(saved.urls)].filter(url => entriesByUrl.has(url));
        if (saved.viewMode === 'feed') {
            const known = new Set(urls);
            const read = new Set(getReadEntries());
            const arrived = allEntries.filter(entry => !known.has(entry.link) && !read.has(entry.link));
            urls = [...arrived.map(entry => entry.link), ...urls];
        }
        const index = urls.indexOf(saved.currentUrl);
        if (index < 0) return false;
        viewMode = saved.viewMode;
        feedEntries = urls.map(url => entriesByUrl.get(url));
        // Restoring must preserve an explicit mark as unread.
        loadEntry(index, { markRead: false });
        return true;
    } catch (error) {
        console.warn('No se pudo recuperar la sesión de lectura', error);
        return false;
    }
}

function setMenuOpen(open, restoreFocus = false) {
    readerMenu.hidden = !open;
    menuBackdrop.hidden = !open;
    btnMenu.setAttribute('aria-expanded', String(open));
    if (open) {
        readerMenu.querySelector('button:not(:disabled), a[href]').focus();
    } else if (restoreFocus) {
        btnMenu.focus();
    }
}

function showStartScreen() {
    setMenuOpen(false);
    localStorage.removeItem(SESSION_KEY);
    iframe.removeAttribute('srcdoc');
    iframe.src = 'about:blank';
    currentIndex = -1;
    viewMode = 'feed';
    const read = new Set(getReadEntries());
    feedEntries = allEntries.filter(entry => !read.has(entry.link));
    const favorites = getFavorites();
    document.getElementById('start-subtitle').textContent = startPhrases[Math.floor(Math.random() * startPhrases.length)];
    document.getElementById('start-unread-count').textContent = feedEntries.length;
    document.getElementById('start-unread-info').style.display = 'block';
    document.getElementById('start-favorites-count').textContent = favorites.length;
    document.getElementById('btn-view-favorites').style.display = favorites.length ? 'inline-block' : 'none';
    startScreen.classList.add('active');
    updateUI();
}

function showFavorites() {
    const favorites = new Set(getFavorites());
    const entries = allEntries.filter(entry => favorites.has(entry.link));
    if (!entries.length) return;
    setMenuOpen(false);
    viewMode = 'favorites';
    feedEntries = entries;
    startScreen.classList.remove('active');
    loadEntry(0);
}


function getReadEntries() {
    const data = localStorage.getItem('welele_read');
    return data ? JSON.parse(data) : [];
}

function setReadEntries(entries) {
    localStorage.setItem('welele_read', JSON.stringify(entries));
    updateUI();
}

function getFavorites() {
    const data = localStorage.getItem('welele_favorites');
    return data ? JSON.parse(data) : [];
}

function setFavorites(entries) {
    localStorage.setItem('welele_favorites', JSON.stringify(entries));
    updateUI();
}

function toggleFavorite() {
    if (currentIndex < 0 || currentIndex >= feedEntries.length) return;
    const url = feedEntries[currentIndex].link;
    let favorites = getFavorites();

    if (favorites.includes(url)) {
        favorites = favorites.filter(u => u !== url);
    } else {
        favorites.push(url);
    }
    setFavorites(favorites);
}

function markCurrentAsRead() {
    if (currentIndex < 0 || currentIndex >= feedEntries.length) return;
    const url = feedEntries[currentIndex].link;
    const readEntries = getReadEntries();
    if (!readEntries.includes(url)) {
        readEntries.push(url);
        setReadEntries(readEntries);
    }
}

function toggleCurrentUnreadStatus() {
    if (currentIndex < 0 || currentIndex >= feedEntries.length) return;
    const url = feedEntries[currentIndex].link;
    let readEntries = getReadEntries();

    if (readEntries.includes(url)) {
        // Estaba leído, marcar como no leído eliminándolo de local storage
        readEntries = readEntries.filter(u => u !== url);
    } else {
        // No estaba leído, marcar como leído
        readEntries.push(url);
    }
    setReadEntries(readEntries);
}

function loadEntry(index, { markRead = true } = {}) {
    if (index < 0 || index >= feedEntries.length) return;
    currentIndex = index;

    const entry = feedEntries[currentIndex];
    openEntry.href = entry.link;
    iframe.removeAttribute('srcdoc');
    setMenuOpen(false);
    // Evitar recargar si ya es el mismo
    const frameUrl = getEntryFrameUrl(entry);
    if (iframe.src !== frameUrl) {
        resetEntryFrame();
        iframe.src = frameUrl;
    }

    // Marcar automáticamente como visto nada más cargar
    if (markRead) markCurrentAsRead();
    saveReadingSession();
    updateUI();
}

function updateUI() {
    const hasCurrent = Boolean(feedEntries[currentIndex]);
    btnFavorite.disabled = !hasCurrent;
    retryEntry.disabled = !hasCurrent;
    menuFavorites.disabled = getFavorites().length === 0;
    if (!hasCurrent) {
        openEntry.removeAttribute('href');
        unreadCountSpan.textContent = "0";
        btnPrev.disabled = true;
        btnNext.disabled = true;
        btnUnread.disabled = true;
        return;
    }

    // El orden de las entradas es 0 = la más nueva.
    // Navegar "Anterior" (Previous) va a las entradas más nuevas (índice menor).
    // Navegar "Siguiente" (Next) va a las entradas más viejas (índice mayor).
    btnPrev.disabled = currentIndex <= 0;
    btnNext.disabled = currentIndex >= feedEntries.length - 1;
    btnUnread.disabled = false;

    const currentUrl = feedEntries[currentIndex].link;
    const readEntries = getReadEntries();

    const unreadIcon = document.getElementById('unread-icon');

    // Si la entrada actual NO está en readEntries, significa que el usuario la marcó explícitamente como "no leída" 
    // porque `loadEntry` lo habría marcado. Cambiamos el icono o color.
    if (!readEntries.includes(currentUrl)) {
        btnUnread.classList.add('unread-active');
        btnUnread.title = "Marcar como visto";
        if (unreadIcon) unreadIcon.innerHTML = `<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle><line x1="3" y1="3" x2="21" y2="21"></line>`;
    } else {
        btnUnread.classList.remove('unread-active');
        btnUnread.title = "Marcar como no visto";
        if (unreadIcon) unreadIcon.innerHTML = `<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle>`;
    }

    // Calcular pendientes en base a TODO EL FEED de esta sesión comparado con localStorage
    const smallText = document.querySelector('#center-info .small-text');
    const favorites = getFavorites();

    if (btnFavorite) {
        if (favorites.includes(currentUrl)) {
            btnFavorite.classList.add('favorite-active');
            btnFavorite.title = "Quitar de favoritos";
            btnFavorite.setAttribute('aria-pressed', 'true');
            document.getElementById('favorite-label').textContent = 'Quitar de favoritos';
        } else {
            btnFavorite.classList.remove('favorite-active');
            btnFavorite.title = "Añadir a favoritos";
            btnFavorite.setAttribute('aria-pressed', 'false');
            document.getElementById('favorite-label').textContent = 'Añadir a favoritos';
        }
    }

    if (viewMode === 'favorites') {
        unreadCountSpan.textContent = feedEntries.length;
        if (smallText) smallText.textContent = "favoritos";
    } else {
        const pendingCount = feedEntries.filter(entry => !readEntries.includes(entry.link)).length;
        unreadCountSpan.textContent = pendingCount;
        if (smallText) smallText.textContent = "pendientes";
    }
}

async function init() {
    try {
        const response = await fetch(ARCHIVE_URL);
        if (!response.ok) throw new Error('Error al leer el historial ' + response.status);
        const data = await response.json();
        allEntries = data.items || [];
        if (!restoreReadingSession()) showStartScreen();
    } catch (error) {
        console.error('Error cargando el archivo', error);
        document.getElementById('start-subtitle').textContent = 'No se pudo cargar el historial. Recarga la página para volver a intentarlo.';
        startScreen.classList.add('active');
    } finally {
        loader.classList.add('hidden');
    }
}

function showEmptyFeed() {
    resizeEntryFrame();
    iframe.srcdoc = '<html lang="es" style="background:#000;color:#f8fafc;font-family:sans-serif;text-align:center;padding-top:25vh"><h2>¡Todo al día! 🎉</h2><p>No hay entradas nuevas.</p></html>';
    updateUI();
}

// Save on every navigation, and again before the browser may discard the tab.
window.addEventListener('pagehide', saveReadingSession);
document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') saveReadingSession();
});
btnMenu.addEventListener('click', () => setMenuOpen(readerMenu.hidden));
menuBackdrop.addEventListener('click', () => setMenuOpen(false, true));
document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && !readerMenu.hidden) setMenuOpen(false, true);
});
readerMenu.addEventListener('keydown', event => {
    if (event.key !== 'Tab') return;
    const items = [...readerMenu.querySelectorAll('button:not(:disabled), a[href]')];
    const first = items[0], last = items[items.length - 1];
    if (event.shiftKey && document.activeElement === first) {
        event.preventDefault(); last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault(); first.focus();
    }
});
openEntry.addEventListener('click', () => setMenuOpen(false, true));
document.getElementById('menu-home').addEventListener('click', showStartScreen);
menuFavorites.addEventListener('click', showFavorites);
document.getElementById('btn-view-favorites').addEventListener('click', showFavorites);
document.getElementById('btn-start').addEventListener('click', () => {
    viewMode = 'feed';
    startScreen.classList.remove('active');
    if (feedEntries.length) loadEntry(0);
    else showEmptyFeed();
});

// Event Listeners
retryEntry.addEventListener('click', () => {
    if (currentIndex < 0 || currentIndex >= feedEntries.length) return;
    setMenuOpen(false, true);
    // Assign again to retry the same URL, without changing read/favorite state.
    resetEntryFrame();
    iframe.src = getEntryFrameUrl(feedEntries[currentIndex]);
});

btnPrev.addEventListener('click', () => {
    loadEntry(currentIndex - 1);
});
btnNext.addEventListener('click', () => {
    loadEntry(currentIndex + 1);
});
btnUnread.addEventListener('click', toggleCurrentUnreadStatus);

if (btnFavorite) {
    btnFavorite.addEventListener('click', () => {
        toggleFavorite();
        setMenuOpen(false, true);
    });
}

const btnExport = document.getElementById('btn-export');
if (btnExport) {
    btnExport.addEventListener('click', () => {
        const readEntries = getReadEntries();
        if (readEntries.length === 0) {
            alert("No hay entradas leídas para exportar.");
            return;
        }
        const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(readEntries, null, 2));
        const downloadAnchorNode = document.createElement('a');
        downloadAnchorNode.setAttribute("href", dataStr);
        downloadAnchorNode.setAttribute("download", "welele_vistos_backup.json");
        document.body.appendChild(downloadAnchorNode);
        downloadAnchorNode.click();
        downloadAnchorNode.remove();
    });
}

init();

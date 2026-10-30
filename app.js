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
const navigationStatus = document.getElementById('navigation-status');
const shareVideoButton = document.getElementById('menu-share-video');
const shareVideoPicker = document.getElementById('share-video-picker');
const shareVideoSelect = document.getElementById('share-video-select');
const shareVideoStatus = document.getElementById('share-video-status');

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
let frameLoading = false;
let videoSources = [];
let preparedVideo = null;
let videoController = null;
let videoSharing = false;
let videoGeneration = 0;
const MAX_VIDEO_BYTES = 100 * 1024 * 1024;
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
    resetVideoSharing();
    frameLoading = false;
    setNavigationLoading(null);
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

function setShareVideoStatus(message) {
    shareVideoStatus.textContent = message;
    shareVideoStatus.hidden = !message;
}

function supportsVideoSharing() {
    return typeof navigator !== 'undefined' &&
        typeof navigator.share === 'function' && typeof navigator.canShare === 'function';
}

function updateVideoShareUI() {
    shareVideoButton.disabled = !feedEntries[currentIndex] || !videoSources.length ||
        videoSharing || !supportsVideoSharing();
    shareVideoSelect.disabled = videoSharing;
    shareVideoPicker.hidden = videoSources.length < 2;
    if (videoSharing) shareVideoButton.setAttribute('aria-busy', 'true');
    else shareVideoButton.removeAttribute('aria-busy');
}

function resetVideoSharing() {
    videoGeneration++;
    if (videoController) videoController.abort();
    videoController = null;
    videoSharing = false;
    videoSources = [];
    preparedVideo = null;
    shareVideoSelect.innerHTML = '';
    setShareVideoStatus('');
    updateVideoShareUI();
}

function currentPostId() {
    const entry = feedEntries[currentIndex];
    if (!entry) return '';
    try { return new URL(entry.link).pathname.match(/^\/post\/(\d+)/)?.[1] || ''; }
    catch (error) { return ''; }
}

function supportedVideoSource(source) {
    if (!source || typeof source.url !== 'string') return null;
    try {
        const url = new URL(source.url);
        const host = url.hostname === 'media.tumblr.com' || url.hostname.endsWith('.media.tumblr.com');
        if (url.protocol !== 'https:' || url.username || url.password || url.port || !host ||
            !/\.(?:mp4|mov|m4v|webm|ogv)$/i.test(url.pathname) || url.href.length > 4096) return null;
        const type = typeof source.type === 'string' ? source.type.split(';')[0].trim().toLowerCase() : '';
        return { url: url.href, type: /^video\/(?:mp4|quicktime|webm|ogg|x-m4v)$/.test(type) ? type : '' };
    } catch (error) {
        return null;
    }
}

window.addEventListener('message', event => {
    if (event.origin !== FULL_PAGE_RELAY_ORIGIN || event.source !== iframe.contentWindow ||
        !event.data || event.data.type !== 'welele-video-sources') return;
    if (event.data.postId !== currentPostId()) {
        resetVideoSharing();
        return;
    }
    const candidates = Array.isArray(event.data.videos) ? event.data.videos.slice(0, 10) : [];
    const seen = new Set();
    const videos = candidates.map(supportedVideoSource).filter(video => {
        if (!video || seen.has(video.url)) return false;
        seen.add(video.url);
        return true;
    });
    if (JSON.stringify(videos) !== JSON.stringify(videoSources)) {
        resetVideoSharing();
        videoSources = videos;
        shareVideoSelect.innerHTML = videos.map((video, index) =>
            `<option value="${index}">Vídeo ${index + 1}</option>`).join('');
    }
    if (!videoSources.length && event.data.hasVideo) {
        setShareVideoStatus('Este vídeo no se puede compartir directamente desde el lector.');
    } else if (videoSources.length && !supportsVideoSharing()) {
        setShareVideoStatus('Este navegador no permite compartir archivos directamente.');
    } else if (!videoSharing && !preparedVideo) {
        setShareVideoStatus('');
    }
    updateVideoShareUI();
});

function videoFileType(video, blob) {
    const headerType = (blob.type || '').split(';')[0].trim().toLowerCase();
    const type = video.type || (/^video\/(?:mp4|quicktime|webm|ogg|x-m4v)$/.test(headerType) ? headerType : '');
    if (type === 'video/mp4') return { type, extension: 'mp4' };
    if (type === 'video/quicktime') return { type, extension: 'mov' };
    if (type === 'video/webm') return { type, extension: 'webm' };
    if (type === 'video/ogg') return { type, extension: 'ogv' };
    if (type === 'video/x-m4v') return { type, extension: 'm4v' };
    const extension = new URL(video.url).pathname.split('.').pop().toLowerCase();
    const types = { mp4:'video/mp4', mov:'video/quicktime', m4v:'video/x-m4v', webm:'video/webm', ogv:'video/ogg' };
    return { type:types[extension], extension };
}

async function shareCurrentVideo() {
    if (videoSharing || !supportsVideoSharing()) return;
    const index = Number(shareVideoSelect.value) || 0;
    const video = videoSources[index];
    if (!video) return;
    const generation = videoGeneration;
    const alreadyPrepared = preparedVideo?.url === video.url;
    videoSharing = true;
    updateVideoShareUI();
    try {
        if (!alreadyPrepared) {
            setShareVideoStatus('Preparando vídeo para compartir…');
            videoController = new AbortController();
            const endpoint = FULL_PAGE_RELAY_ORIGIN + '/share-video?url=' + encodeURIComponent(video.url);
            const response = await fetch(endpoint, { signal:videoController.signal, credentials:'omit' });
            if (response.status === 413) throw new Error('VIDEO_TOO_LARGE');
            if (!response.ok) throw new Error('VIDEO_FETCH_FAILED');
            const blob = await response.blob();
            if (!blob.size) throw new Error('VIDEO_FETCH_FAILED');
            if (blob.size > MAX_VIDEO_BYTES) throw new Error('VIDEO_TOO_LARGE');
            if (generation !== videoGeneration) return;
            const format = videoFileType(video, blob);
            const name = `welele-${currentPostId()}-${index + 1}.${format.extension}`;
            preparedVideo = { url:video.url, file:new File([blob], name, {type:format.type}) };
        }
        if (!navigator.canShare({ files:[preparedVideo.file] })) {
            setShareVideoStatus('Este navegador no permite compartir este vídeo como archivo.');
            return;
        }
        if (navigator.userActivation && !navigator.userActivation.isActive) {
            setShareVideoStatus('Vídeo preparado. Pulsa de nuevo «Compartir vídeo».');
            return;
        }
        await navigator.share({ files:[preparedVideo.file] });
        if (generation !== videoGeneration) return;
        setShareVideoStatus('');
        setMenuOpen(false, true);
    } catch (error) {
        if (generation !== videoGeneration) return;
        if (error.name === 'AbortError') setShareVideoStatus('');
        else if (error.name === 'NotAllowedError' && !alreadyPrepared) {
            setShareVideoStatus('Vídeo preparado. Pulsa de nuevo «Compartir vídeo».');
        } else if (error.message === 'VIDEO_TOO_LARGE') {
            setShareVideoStatus('Este vídeo supera los 100 MB y no se puede compartir desde el lector.');
        } else {
            setShareVideoStatus('No se pudo compartir el vídeo. Vuelve a intentarlo.');
        }
    } finally {
        if (generation === videoGeneration) {
            videoController = null;
            videoSharing = false;
            updateVideoShareUI();
        }
    }
}

function setNavigationLoading(button) {
    for (const [candidate, label] of [[btnPrev, 'Anterior'], [btnNext, 'Siguiente']]) {
        const loading = candidate === button;
        candidate.classList[loading ? 'add' : 'remove']('is-loading');
        candidate.title = loading ? `Cargando entrada ${label.toLowerCase()}` : label;
        candidate.setAttribute('aria-label', candidate.title);
        if (loading) candidate.setAttribute('aria-busy', 'true');
        else candidate.removeAttribute('aria-busy');
    }
    navigationStatus.textContent = button ? button.title : '';
}

function settleEntryFrame() {
    if (!frameLoading) return;
    // Ignore a late initial about:blank load after a real navigation has started.
    try {
        if (iframe.contentDocument?.URL === 'about:blank' && iframe.src !== 'about:blank') return;
    } catch (error) {
        // Cross-origin documents cannot be inspected; their load event still settles navigation.
    }
    frameLoading = false;
    setNavigationLoading(null);
}

iframe.addEventListener('load', settleEntryFrame);
iframe.addEventListener('error', settleEntryFrame);

function loadEntry(index, { markRead = true, navigationButton = null } = {}) {
    if (index < 0 || index >= feedEntries.length) return;
    currentIndex = index;

    const entry = feedEntries[currentIndex];
    openEntry.href = entry.link;
    iframe.removeAttribute('srcdoc');
    setMenuOpen(false);
    // Evitar recargar si ya es el mismo
    const frameUrl = getEntryFrameUrl(entry);
    if (iframe.src !== frameUrl) {
        resetVideoSharing();
        resetEntryFrame();
        frameLoading = true;
        setNavigationLoading(navigationButton);
        iframe.src = frameUrl;
    } else {
        setNavigationLoading(frameLoading ? navigationButton : null);
    }

    // Marcar automáticamente como visto nada más cargar
    if (markRead) markCurrentAsRead();
    saveReadingSession();
    updateUI();
}

function updateUI() {
    updateVideoShareUI();
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
    resetVideoSharing();
    frameLoading = false;
    setNavigationLoading(null);
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
    resetVideoSharing();
    // Assign again to retry the same URL, without changing read/favorite state.
    resetEntryFrame();
    frameLoading = true;
    iframe.src = getEntryFrameUrl(feedEntries[currentIndex]);
});

btnPrev.addEventListener('click', () => {
    loadEntry(currentIndex - 1, { navigationButton: btnPrev });
});
btnNext.addEventListener('click', () => {
    loadEntry(currentIndex + 1, { navigationButton: btnNext });
});
btnUnread.addEventListener('click', toggleCurrentUnreadStatus);
shareVideoButton.addEventListener('click', shareCurrentVideo);
shareVideoSelect.addEventListener('change', () => {
    preparedVideo = null;
    setShareVideoStatus('');
});

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

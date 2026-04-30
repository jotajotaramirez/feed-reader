const btnPrev = document.getElementById('btn-prev');
const btnNext = document.getElementById('btn-next');
const btnUnread = document.getElementById('btn-unread');
const unreadCountSpan = document.getElementById('unread-count');
const iframe = document.getElementById('welele-frame');
const loader = document.getElementById('loader');

const startPhrases = [
    "Tu dosis diaria de humor y entretenimiento.",
    "Vamos a partirnos el ojete.",
    "Estamos aquí por los loles.",
];

const ARCHIVE_URL = 'welele_archive.json';
let allEntries = [];
let feedEntries = [];
let currentIndex = -1;
let viewMode = 'feed';

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

function loadEntry(index) {
    if (index < 0 || index >= feedEntries.length) return;
    currentIndex = index;

    const entry = feedEntries[currentIndex];
    // Evitar recargar si ya es el mismo
    if (iframe.src !== entry.link) {
        iframe.src = entry.link;
    }

    // Marcar automáticamente como visto nada más cargar
    markCurrentAsRead();
    updateUI();
}

function updateUI() {
    if (feedEntries.length === 0) {
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
    const btnFavorite = document.getElementById('btn-favorite');

    if (btnFavorite) {
        if (favorites.includes(currentUrl)) {
            btnFavorite.classList.add('favorite-active');
            btnFavorite.title = "Quitar de favoritos";
        } else {
            btnFavorite.classList.remove('favorite-active');
            btnFavorite.title = "Añadir a favoritos";
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
        // En lugar de llamar al RSS en vivo (que pierde el historial), ahora leemos 
        // nuestro gran archivo histórico local actualizado automáticamente por GitHub Actions.
        const response = await fetch(ARCHIVE_URL);
        if (!response.ok) throw new Error("Error al leer el historial " + response.status);

        const data = await response.json();
        allEntries = data.items || [];

        const readEntries = getReadEntries();
        const favorites = getFavorites();

        // Filtrar SOLO las que no habian sido leidas antes de INICIAR la sesión
        // De este modo "recordará qué he visitado para no volver a mostrarme".
        feedEntries = allEntries.filter(entry => !readEntries.includes(entry.link));
        viewMode = 'feed';

        loader.classList.add('hidden');

        const startScreen = document.getElementById('start-screen');
        const btnStart = document.getElementById('btn-start');
        const btnFavorites = document.getElementById('btn-view-favorites');
        const favoritesCount = document.getElementById('start-favorites-count');

        if (favorites.length > 0 && btnFavorites && favoritesCount) {
            btnFavorites.style.display = 'inline-block';
            favoritesCount.textContent = favorites.length;

            btnFavorites.addEventListener('click', () => {
                viewMode = 'favorites';
                feedEntries = allEntries.filter(entry => favorites.includes(entry.link));
                startScreen.classList.remove('active');
                if (feedEntries.length > 0) {
                    loadEntry(0);
                }
            });
        }

        if (feedEntries.length > 0 || favorites.length > 0) {
            const subtitle = document.getElementById('start-subtitle');

            // Set random phrase
            subtitle.textContent = startPhrases[Math.floor(Math.random() * startPhrases.length)];

            const startUnreadInfo = document.getElementById('start-unread-info');
            const startUnreadCount = document.getElementById('start-unread-count');
            if (startUnreadInfo && startUnreadCount && feedEntries.length > 0) {
                startUnreadCount.textContent = feedEntries.length;
                startUnreadInfo.style.display = 'block';
            }

            startScreen.classList.add('active');

            btnStart.addEventListener('click', () => {
                viewMode = 'feed';
                startScreen.classList.remove('active');
                if (feedEntries.length > 0) {
                    loadEntry(0);
                } else {
                    iframe.srcdoc = `
                        <html style="background:#000000; color:#f8fafc; display:flex; justify-content:center; align-items:center; height:100vh; font-family:sans-serif;">
                            <body>
                                <div style="text-align:center;">
                                    <h2 style="margin-bottom:10px;">¡Todo al día! 🎉</h2>
                                    <p style="color:#94a3b8;">No hay entradas nuevas.</p>
                                </div>
                            </body>
                        </html>`;
                    updateUI();
                }
            });
        } else {
            // No hay nada nuevo
            iframe.srcdoc = `
                <html style="background:#000000; color:#f8fafc; display:flex; justify-content:center; align-items:center; height:100vh; font-family:sans-serif;">
                    <body>
                        <div style="text-align:center;">
                            <h2 style="margin-bottom:10px;">¡Todo al día! 🎉</h2>
                            <p style="color:#94a3b8;">No hay entradas nuevas.</p>
                        </div>
                    </body>
                </html>`;
            updateUI();
        }

    } catch (e) {
        console.error("Error cargando RSS", e);
        loader.classList.add('hidden');

        // Un mensaje de error elegante
        iframe.srcdoc = `
            <html style="background:#000000; color:#f8fafc; display:flex; justify-content:center; align-items:center; height:100vh; font-family:sans-serif;">
                <body>
                    <div style="text-align:center; max-width: 80%; padding: 20px; border: 1px solid #334155; border-radius: 12px;">
                        <svg viewBox="0 0 24 24" fill="none" stroke="#ef4444" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width: 48px; height: 48px; margin-bottom:15px;"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg>
                        <h2 style="margin-bottom:10px;">Error al cargar Welele</h2>
                        <p style="color:#94a3b8; font-size:14px;">${e.message}</p>
                        <p style="color:#94a3b8; font-size:13px; margin-top:20px; text-decoration: underline;">
                            (Nota: Es muy probable que esto se deba a restricciones de CORS del navegador al no usar un proxy)
                        </p>
                    </div>
                </body>
            </html>`;
    }
}

// Event Listeners
btnPrev.addEventListener('click', () => {
    loadEntry(currentIndex - 1);
});
btnNext.addEventListener('click', () => {
    loadEntry(currentIndex + 1);
});
btnUnread.addEventListener('click', toggleCurrentUnreadStatus);

const btnFavorite = document.getElementById('btn-favorite');
if (btnFavorite) {
    btnFavorite.addEventListener('click', toggleFavorite);
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

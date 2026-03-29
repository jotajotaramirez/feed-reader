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
    "Se viene el descojone padre.",
    "Vamos a echarnos unas risas de las de mearse encima.",
    "Aquí hemos venido a hacer el cafre y poco más.",
    "Menuda mofada va a ser esto, ya verás.",
    "A ver quién suelta la mayor parida por minuto.",
    "Se va a liar una buena solo por los loles.",
    "Qué cebada de plan, nos vamos a partir el eje.",
    "Panzada de reír asegurada, chavales.",
    "Esto es canela en rama para el cachondeo.",
    "Vamos a deshuevarnos vivo con la tontería.",
    "Vaya mofeta de situación, es que me meo.",
    "Aquí solo se viene a disfrutar del pitorreo máximo.",
    "Prepárate, que nos vamos a partir la caja a lo bestia.",
    "Qué desfase de risas nos espera hoy.",
    "Vamos a dar el cante pero bien, solo por el meme.",
    "Menudo pitorreo de los buenos tenemos montado.",
    "Se avecina el festival del descojone total.",
    "Vamos a hacer el canelo nivel Dios.",
    "Esto va a ser un despelote absoluto, ya te digo.",
    "Se viene la risión máxima, eso ni se pregunta."
];

const ARCHIVE_URL = 'welele_archive.json';
let feedEntries = [];
let currentIndex = -1;

function getReadEntries() {
    const data = localStorage.getItem('welele_read');
    return data ? JSON.parse(data) : [];
}

function setReadEntries(entries) {
    localStorage.setItem('welele_read', JSON.stringify(entries));
    updateUI();
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
    const unreadText = document.getElementById('unread-text');
    
    // Si la entrada actual NO está en readEntries, significa que el usuario la marcó explícitamente como "no leída" 
    // porque `loadEntry` lo habría marcado. Cambiamos el icono o color.
    if (!readEntries.includes(currentUrl)) {
        btnUnread.classList.add('unread-active');
        btnUnread.title = "Marcar como visto";
        if (unreadText) unreadText.textContent = "No visto";
        if (unreadIcon) unreadIcon.innerHTML = `<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle><line x1="3" y1="3" x2="21" y2="21"></line>`;
    } else {
        btnUnread.classList.remove('unread-active');
        btnUnread.title = "Marcar como no visto";
        if (unreadText) unreadText.textContent = "Visto";
        if (unreadIcon) unreadIcon.innerHTML = `<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle>`;
    }
    
    // Calcular pendientes en base a TODO EL FEED de esta sesión comparado con localStorage
    const pendingCount = feedEntries.filter(entry => !readEntries.includes(entry.link)).length;
    unreadCountSpan.textContent = pendingCount;
}

async function init() {
    try {
        // En lugar de llamar al RSS en vivo (que pierde el historial), ahora leemos 
        // nuestro gran archivo histórico local actualizado automáticamente por GitHub Actions.
        const response = await fetch(ARCHIVE_URL);
        if (!response.ok) throw new Error("Error al leer el historial " + response.status);
        
        const data = await response.json();
        const allEntries = data.items || [];
        
        const readEntries = getReadEntries();
        // Filtrar SOLO las que no habian sido leidas antes de INICIAR la sesión
        // De este modo "recordará qué he visitado para no volver a mostrarme".
        feedEntries = allEntries.filter(entry => !readEntries.includes(entry.link));
        
        loader.classList.add('hidden');
        
        if (feedEntries.length > 0) {
            const startScreen = document.getElementById('start-screen');
            const btnStart = document.getElementById('btn-start');
            const subtitle = document.getElementById('start-subtitle');
            
            // Set random phrase
            subtitle.textContent = startPhrases[Math.floor(Math.random() * startPhrases.length)];
            
            startScreen.classList.add('active');
            
            btnStart.addEventListener('click', () => {
                startScreen.classList.remove('active');
                loadEntry(0);
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

init();

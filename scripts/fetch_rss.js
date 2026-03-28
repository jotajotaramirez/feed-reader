const fs = require('fs');
const path = require('path');

const ARCHIVE_FILE = path.join(__dirname, '..', 'welele_archive.json');
const RSS_TO_JSON_API = 'https://api.rss2json.com/v1/api.json?rss_url=https://welele.es/rss';

async function updateArchive() {
    try {
        console.log('Cargando el historial actual...');
        let archive = { items: [] };
        if (fs.existsSync(ARCHIVE_FILE)) {
            const raw = fs.readFileSync(ARCHIVE_FILE, 'utf8');
            archive = JSON.parse(raw);
        }

        // Limpiar enlaces basuras o de la carpeta de inoreader
        archive.items = archive.items.filter(item => item.link && item.link.includes('welele.es/post/'));

        console.log(`El historial actual tiene ${archive.items.length} artículos.`);

        console.log(`Descargando los posts más recientes desde Welele...`);
        const response = await fetch(RSS_TO_JSON_API);
        if (!response.ok) {
            throw new Error(`Error en la red: ${response.status}`);
        }
        
        const feedData = await response.json();
        const newItems = feedData.items || [];
        console.log(`Se han encontrado ${newItems.length} artículos recientes en el RSS.`);

        // Extraer IDs para evitar duplicados
        const existingLinks = new Set(archive.items.map(item => item.link.trim()));
        let addedCount = 0;

        // Limpiamos los nuevos también (en caso de que tengan query string)
        newItems.forEach(item => {
            const cleanLink = item.link.split('?')[0].trim();
            if (!existingLinks.has(cleanLink)) {
                archive.items.push({
                    title: item.title,
                    link: cleanLink
                });
                existingLinks.add(cleanLink);
                addedCount++;
            }
        });

        // Ordenar el archivo completo. 
        // Welele usa IDs numéricos en sus enlaces (ej. welele.es/post/811191043802415105).
        // Podemos extraer ese ID y ordenar descendentemente (los más nuevos primero).
        archive.items.sort((a, b) => {
            const getPostId = (url) => {
                const match = url.match(/\/post\/(\d+)/);
                return match ? BigInt(match[1]) : 0n;
            };
            const idA = getPostId(a.link);
            const idB = getPostId(b.link);
            
            if (idA > idB) return -1;
            if (idA < idB) return 1;
            return 0;
        });

        console.log(`Se han añadido ${addedCount} artículos nuevos al archivo.`);
        
        fs.writeFileSync(ARCHIVE_FILE, JSON.stringify(archive, null, 2));
        console.log('¡welele_archive.json actualizado con éxito!');

    } catch (error) {
        console.error('Error al actualizar el archivo Welele:', error);
        process.exit(1);
    }
}

updateArchive();

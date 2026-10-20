const fs = require('fs');
const path = require('path');
const { XMLParser, XMLValidator } = require('fast-xml-parser');

const ARCHIVE_FILE = path.join(__dirname, '..', 'welele_archive.json');
const RSS_URL = 'https://welele.es/rss';
const MAX_ATTEMPTS = 4;
const REQUEST_TIMEOUT_MS = 20000;

async function downloadFeed() {
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

        try {
            const response = await fetch(RSS_URL, {
                signal: controller.signal,
                headers: {
                    'Accept': 'application/rss+xml, application/xml, text/xml',
                    'User-Agent': 'WeleleArchiveBot/1.0 (+https://github.com/jotajotaramirez/feed-reader)'
                }
            });

            if (!response.ok) {
                throw new Error(`HTTP ${response.status} from ${RSS_URL}`);
            }

            return await response.text();
        } catch (error) {
            if (attempt === MAX_ATTEMPTS) throw error;
            const delayMs = 1000 * (2 ** (attempt - 1));
            console.warn(`RSS request ${attempt}/${MAX_ATTEMPTS} failed: ${error.message}. Retrying in ${delayMs} ms...`);
            await new Promise(resolve => setTimeout(resolve, delayMs));
        } finally {
            clearTimeout(timeout);
        }
    }
}

async function updateArchive() {
    try {
        console.log('Loading the current archive...');
        let archive = { items: [] };
        if (fs.existsSync(ARCHIVE_FILE)) {
            const raw = fs.readFileSync(ARCHIVE_FILE, 'utf8');
            archive = JSON.parse(raw);
        }
        if (!Array.isArray(archive.items)) {
            throw new Error('Invalid archive format: "items" must be an array.');
        }

        // Remove unrelated links, including old Inoreader links.
        archive.items = archive.items.filter(item => item.link && item.link.includes('welele.es/post/'));
        console.log(`The current archive contains ${archive.items.length} articles.`);

        console.log('Downloading the original Welele RSS feed...');
        const xml = await downloadFeed();
        const validation = XMLValidator.validate(xml);
        if (validation !== true) {
            throw new Error(`Invalid RSS XML: ${validation.err?.msg || 'unknown validation error'}`);
        }

        const feed = new XMLParser({ parseTagValue: false }).parse(xml);
        const rawItems = feed?.rss?.channel?.item;
        const items = Array.isArray(rawItems) ? rawItems : (rawItems ? [rawItems] : []);
        if (items.length === 0) {
            throw new Error('The RSS feed contains no articles; keeping the existing archive.');
        }

        const newItems = items.map(item => ({
            title: typeof item.title === 'string' ? item.title : '',
            link: typeof item.link === 'string' ? item.link : ''
        })).filter(item => item.link.includes('welele.es/post/'));
        if (newItems.length === 0) {
            throw new Error('The RSS feed contains no valid Welele post links; keeping the archive.');
        }

        console.log(`Found ${newItems.length} articles in the original RSS feed (not limited to 10).`);

        // Extract links to avoid duplicates.
        const existingLinks = new Set(archive.items.map(item => item.link.trim()));
        let addedCount = 0;
        let overlapCount = 0;

        // Normalize new URLs by removing query strings before comparison.
        newItems.forEach(item => {
            const cleanLink = item.link.split('?')[0].trim();
            if (existingLinks.has(cleanLink)) {
                overlapCount++;
                return;
            }
            archive.items.push({ title: item.title, link: cleanLink });
            existingLinks.add(cleanLink);
            addedCount++;
        });

        if (overlapCount === 0) {
            console.warn('WARNING: The RSS feed does not overlap with the archive. Check for posts older than the feed window.');
        }

        // Sort the full archive by Tumblr's numeric post IDs (newest first).
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

        console.log(`Added ${addedCount} new articles to the archive.`);
        if (addedCount > 0) {
            fs.writeFileSync(ARCHIVE_FILE, JSON.stringify(archive, null, 2));
            console.log('welele_archive.json updated successfully!');
        } else {
            console.log('No new articles; archive unchanged.');
        }
    } catch (error) {
        console.error('Failed to update the Welele archive:', error);
        process.exitCode = 1;
    }
}

updateArchive();

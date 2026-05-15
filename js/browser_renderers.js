import { favoriteKeyFromItem } from "./browser_helpers.js";

export function renderChunkedGrid({
    grid,
    observer,
    items,
    chunkSize,
    minHeight,
    renderItem,
    append = false,
}) {
    if (!append) {
        if (observer) observer.disconnect();
        grid.innerHTML = "";
    }

    for (let i = 0; i < items.length; i += chunkSize) {
        const chunkItems = items.slice(i, i + chunkSize);
        const chunk = document.createElement("div");
        chunk.className = "anima-chunk";
        chunk.style.minHeight = minHeight;
        chunk._mount = () => {
            if (chunk.children.length) return;
            const frag = document.createDocumentFragment();
            chunkItems.forEach((item) => {
                const node = renderItem?.(item);
                if (node) frag.appendChild(node);
            });
            chunk.appendChild(frag);
            chunk.style.minHeight = "";
        };
        chunk._unmount = () => {
            if (!chunk.children.length) return;
            chunk.style.minHeight = `${chunk.offsetHeight}px`;
            chunk.innerHTML = "";
        };
        grid.appendChild(chunk);
        observer?.observe(chunk);
    }
}

export function normalizeSearchText(value = "") {
    return String(value || "")
        .toLowerCase()
        .replace(/^@+/, "")
        .replace(/_/g, " ")
        .replace(/\s+/g, " ")
        .trim();
}

function parseOptionalNumber(value, { integer = false } = {}) {
    if (value === "" || value == null) return null;
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) return null;
    const safe = Math.max(0, parsed);
    return integer ? Math.floor(safe) : safe;
}

export function normalizeArtistFilters(filters = {}) {
    const query = normalizeSearchText(filters?.query ?? filters?.filter ?? "");
    let worksMin = parseOptionalNumber(filters?.worksMin, { integer: true });
    let worksMax = parseOptionalNumber(filters?.worksMax, { integer: true });
    let uniquenessMin = parseOptionalNumber(filters?.uniquenessMin);
    let uniquenessMax = parseOptionalNumber(filters?.uniquenessMax);

    if (worksMin != null && worksMax != null && worksMin > worksMax) {
        [worksMin, worksMax] = [worksMax, worksMin];
    }

    if (uniquenessMin != null && uniquenessMax != null && uniquenessMin > uniquenessMax) {
        [uniquenessMin, uniquenessMax] = [uniquenessMax, uniquenessMin];
    }

    return {
        query,
        tokens: query ? query.split(" ").filter(Boolean) : [],
        worksMin,
        worksMax,
        uniquenessMin,
        uniquenessMax,
        favoritesOnly: !!filters?.favoritesOnly,
    };
}

export function countActiveArtistFilters(filters = {}) {
    const normalized = Array.isArray(filters?.tokens) ? filters : normalizeArtistFilters(filters);
    let count = 0;
    if (normalized.query) count += 1;
    if (normalized.worksMin != null) count += 1;
    if (normalized.worksMax != null) count += 1;
    if (normalized.uniquenessMin != null) count += 1;
    if (normalized.uniquenessMax != null) count += 1;
    if (normalized.favoritesOnly) count += 1;
    return count;
}

function getArtistSearchFields(artist) {
    const tag = normalizeSearchText(artist?.tag || "");
    const name = normalizeSearchText(artist?.name || "");
    const hay = normalizeSearchText(artist?._s || `${artist?.tag || ""} ${artist?.name || ""}`);
    return { tag, name, hay };
}

function hasWordBoundaryMatch(haystack, token) {
    return haystack === token || haystack.startsWith(`${token} `) || haystack.includes(` ${token}`);
}

function scoreTokenMatch(fields, token) {
    const { tag, name, hay } = fields;
    if (tag === token) return -160;
    if (name === token) return -145;
    if (tag.startsWith(token)) return -120;
    if (name.startsWith(token)) return -105;
    if (hasWordBoundaryMatch(hay, token)) return -80;
    return hay.includes(token) ? -36 : 0;
}

function styleSearchScore(artist, filters) {
    if (!filters.tokens.length) return 0;

    const fields = getArtistSearchFields(artist);
    let score = 0;

    if (filters.query) {
        if (fields.tag === filters.query) {
            score -= 1000;
        } else if (fields.name === filters.query) {
            score -= 900;
        } else if (fields.tag.startsWith(filters.query)) {
            score -= 700;
        } else if (fields.name.startsWith(filters.query)) {
            score -= 640;
        } else if (hasWordBoundaryMatch(fields.hay, filters.query)) {
            score -= 500;
        } else {
            score -= 360;
        }
    }

    for (const token of filters.tokens) {
        score += scoreTokenMatch(fields, token);
    }

    score += Math.min(fields.tag.length, 160) / 1000;
    return score;
}

function resolveFavorited(artist, { favorited = null, favoriteMap = null } = {}) {
    if (typeof favorited === "boolean") return favorited;
    if (!favoriteMap?.size) return false;
    const key = favoriteKeyFromItem(artist);
    return !!key && favoriteMap.has(key);
}

export function matchesArtistFilters(artist, filters = {}, options = {}) {
    const normalized = Array.isArray(filters?.tokens) ? filters : normalizeArtistFilters(filters);
    const works = Number(artist?.works ?? 0) || 0;
    const uniqueness = Number(artist?.uniqueness_score ?? 0) || 0;

    if (normalized.favoritesOnly && !resolveFavorited(artist, options)) return false;
    if (normalized.worksMin != null && works < normalized.worksMin) return false;
    if (normalized.worksMax != null && works > normalized.worksMax) return false;
    if (normalized.uniquenessMin != null && uniqueness < normalized.uniquenessMin) return false;
    if (normalized.uniquenessMax != null && uniqueness > normalized.uniquenessMax) return false;

    if (!normalized.tokens.length) return true;
    const { hay } = getArtistSearchFields(artist);
    return normalized.tokens.every((token) => hay.includes(token));
}

export function applyArtistFilters(list = [], filters = {}, options = {}) {
    const normalized = Array.isArray(filters?.tokens) ? filters : normalizeArtistFilters(filters);
    let filtered = list
        .map((artist, index) => ({
            artist,
            index,
        }))
        .filter((entry) => matchesArtistFilters(entry.artist, normalized, options));

    if (normalized.tokens.length) {
        filtered = filtered
            .map((entry) => ({
                ...entry,
                score: styleSearchScore(entry.artist, normalized),
            }))
            .sort((a, b) => {
                if (a.score !== b.score) return a.score - b.score;
                return a.index - b.index;
            });
    }

    return filtered.map((entry) => entry.artist);
}

export function buildStyleList(styles = [], {
    sort = "works",
    filters = {},
    favoriteMap = null,
} = {}) {
    let list = [...styles];

    if (sort === "name") {
        list.sort((a, b) => (a.tag || "").localeCompare(b.tag || ""));
    } else if (sort === "uniqueness") {
        list.sort((a, b) => {
            const u = (Number(b.uniqueness_score) || 0) - (Number(a.uniqueness_score) || 0);
            if (u) return u;
            const w = (Number(b.works) || 0) - (Number(a.works) || 0);
            if (w) return w;
            return (a.tag || "").localeCompare(b.tag || "");
        });
        list.forEach((artist, i) => {
            artist.uniquenessRank = i + 1;
        });
    } else {
        list.sort((a, b) => (Number(b.works) || 0) - (Number(a.works) || 0));
    }

    return applyArtistFilters(list, filters, { favoriteMap });
}

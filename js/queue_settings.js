import { buildSlotState, normalizeMaxSlots } from "./slot_state.js";
import { logWarn } from "./logger.js";

export const ANIMA_PIN_FAVORITES_KEY = "_anima_pin_favorites";
export const ANIMA_QUEUE_MODE_KEY = "_anima_queue_mode";
export const ANIMA_AUTO_QUEUE_KEY = "_anima_auto_queue";
export const ANIMA_LOCKED_SLOTS_KEY = "_anima_locked_slots";

const WIDGET_PIN_FAVORITES = "Pin Favorites";
const WIDGET_QUEUE_MODE = "After Queue";
const WIDGET_AUTO_QUEUE = "Auto Queue";

function ensureNodeProperties(node) {
    if (!node?.properties || typeof node.properties !== "object") {
        node.properties = {};
    }
    return node.properties;
}

function getWidgetValue(node, name) {
    const widget = node?.widgets?.find((item) => String(item?.name || "") === name);
    return widget?.value;
}

function normalizeTag(value) {
    return String(value || "").trim().replace(/\s+/g, "_").toLowerCase();
}

export function findArtistByTag(artists = [], tag = "") {
    const normalized = normalizeTag(tag);
    if (!normalized) return null;
    return artists.find((artist) => normalizeTag(artist?.tag || "") === normalized) || null;
}

function uniqueArtists(artists = []) {
    const list = [];
    const seen = new Set();

    for (const artist of artists) {
        const tag = normalizeTag(artist?.tag || "");
        if (!tag || seen.has(tag)) continue;
        seen.add(tag);
        list.push({ ...artist, _queueTag: tag });
    }

    return list;
}

function shuffledArtists(artists = [], randomFn = Math.random) {
    const list = [...artists];
    for (let i = list.length - 1; i > 0; i -= 1) {
        const j = Math.floor(randomFn() * (i + 1));
        [list[i], list[j]] = [list[j], list[i]];
    }
    return list;
}

function resolveLockedSlotCount(node, maxSlots = null, lockedSlots = null) {
    if (maxSlots != null) {
        return normalizeMaxSlots(maxSlots, 1);
    }

    const props = ensureNodeProperties(node);
    return normalizeMaxSlots(
        (Array.isArray(node?._currentTags) && node._currentTags.length ? node._currentTags.length : null)
        ?? (Array.isArray(node?._lockedSlots) && node._lockedSlots.length ? node._lockedSlots.length : null)
        ?? (Array.isArray(lockedSlots) && lockedSlots.length ? lockedSlots.length : null)
        ?? (Array.isArray(props[ANIMA_LOCKED_SLOTS_KEY]) && props[ANIMA_LOCKED_SLOTS_KEY].length ? props[ANIMA_LOCKED_SLOTS_KEY].length : null)
        ?? 1,
        1
    );
}

function normalizeLockedSlotValue(value) {
    if (value === true || value === 1) return true;
    const normalized = String(value || "").trim().toLowerCase();
    return normalized === "true" || normalized === "1" || normalized === "on" || normalized === "yes" || normalized === "locked";
}

export function normalizeLockedSlots(lockedSlots = [], maxSlots = null) {
    const slotCount = normalizeMaxSlots(maxSlots ?? (Array.isArray(lockedSlots) ? lockedSlots.length : 0), 1);
    return Array.from({ length: slotCount }, (_, slotIndex) => normalizeLockedSlotValue(lockedSlots?.[slotIndex]));
}

export function readLockedSlots(node, maxSlots = null) {
    const props = ensureNodeProperties(node);
    const slotCount = resolveLockedSlotCount(node, maxSlots);
    const source = Array.isArray(node?._lockedSlots) ? node._lockedSlots : props[ANIMA_LOCKED_SLOTS_KEY];
    const normalized = normalizeLockedSlots(source, slotCount);
    props[ANIMA_LOCKED_SLOTS_KEY] = [...normalized];
    node._lockedSlots = [...normalized];
    return normalized;
}

export function writeLockedSlots(node, lockedSlots, maxSlots = null) {
    const props = ensureNodeProperties(node);
    const slotCount = resolveLockedSlotCount(node, maxSlots, lockedSlots);
    const normalized = normalizeLockedSlots(lockedSlots, slotCount);
    props[ANIMA_LOCKED_SLOTS_KEY] = [...normalized];
    node._lockedSlots = [...normalized];
    return normalized;
}

function buildSlotStateWithLocks(state) {
    const current = buildSlotState(state);
    return {
        ...current,
        lockedSlots: normalizeLockedSlots(state?.lockedSlots, current.maxSlots),
    };
}

function buildEffectiveLockedSlots(state, pinFavorites = false, favoriteTags = new Set()) {
    const current = buildSlotStateWithLocks(state);
    return current.tags.map((tag, slotIndex) => {
        if (current.lockedSlots[slotIndex]) return true;
        return !!pinFavorites && !!tag && favoriteTags.has(tag);
    });
}

export function readPinFavorites(node) {
    const props = ensureNodeProperties(node);
    const widgetValue = getWidgetValue(node, WIDGET_PIN_FAVORITES);
    if (widgetValue != null && widgetValue !== "") {
        const normalized = String(widgetValue).toLowerCase() === "on" ? "on" : "off";
        props[ANIMA_PIN_FAVORITES_KEY] = normalized;
        return normalized === "on";
    }

    return String(props[ANIMA_PIN_FAVORITES_KEY] || "off").toLowerCase() === "on";
}

export function writePinFavorites(node, value) {
    const props = ensureNodeProperties(node);
    const normalized = String(value || "").toLowerCase() === "on" ? "on" : "off";
    props[ANIMA_PIN_FAVORITES_KEY] = normalized;
    return normalized;
}

export function normalizeQueueMode(value) {
    const normalized = String(value || "").trim().toLowerCase().replace(/\s+/g, "_");
    if (normalized === "fixed") return "fixed";
    if (normalized === "next" || normalized === "next_artist") return "next_artist";
    if (normalized === "random" || normalized === "random_artist") return "random_artist";
    if (
        normalized === "random_no_repeat"
        || normalized === "random_artist_no_repeat"
        || normalized === "no_repeat_random"
        || normalized === "random_norepeat"
    ) {
        return "random_no_repeat";
    }
    if (
        normalized === "favorite_random"
        || normalized === "favorite_random_artist"
        || normalized === "favorites_random"
        || normalized === "favorites_random_artist"
    ) {
        return "favorite_random";
    }
    if (
        normalized === "favorite_no_repeat"
        || normalized === "favorite_random_no_repeat"
        || normalized === "favorite_random_artist_no_repeat"
        || normalized === "favorites_no_repeat"
        || normalized === "favorites_random_no_repeat"
    ) {
        return "favorite_no_repeat";
    }
    if (normalized === "off") return "fixed";
    return "fixed";
}

export function queueModeNeedsFavoriteTags(mode, pinFavorites = false) {
    const normalizedMode = normalizeQueueMode(mode);
    return !!pinFavorites || normalizedMode === "favorite_random" || normalizedMode === "favorite_no_repeat";
}

export function readQueueMode(node) {
    const props = ensureNodeProperties(node);
    const widgetValue = getWidgetValue(node, WIDGET_QUEUE_MODE);
    if (widgetValue != null && widgetValue !== "") {
        const normalized = normalizeQueueMode(widgetValue);
        props[ANIMA_QUEUE_MODE_KEY] = normalized;
        return normalized;
    }

    return normalizeQueueMode(props[ANIMA_QUEUE_MODE_KEY]);
}

export function writeQueueMode(node, value) {
    const props = ensureNodeProperties(node);
    const normalized = normalizeQueueMode(value);
    props[ANIMA_QUEUE_MODE_KEY] = normalized;
    return normalized;
}

export function readAutoQueue(node) {
    const props = ensureNodeProperties(node);
    const widgetValue = getWidgetValue(node, WIDGET_AUTO_QUEUE);
    if (widgetValue != null && widgetValue !== "") {
        const normalized = String(widgetValue).toLowerCase() === "on" ? "on" : "off";
        props[ANIMA_AUTO_QUEUE_KEY] = normalized;
        return normalized === "on";
    }

    return String(props[ANIMA_AUTO_QUEUE_KEY] || "off").toLowerCase() === "on";
}

export function writeAutoQueue(node, value) {
    const props = ensureNodeProperties(node);
    const normalized = String(value || "").toLowerCase() === "on" ? "on" : "off";
    props[ANIMA_AUTO_QUEUE_KEY] = normalized;
    return normalized;
}

export async function loadFavoriteTagSet(fetchImpl = fetch) {
    try {
        const response = await fetchImpl("/anima/favorites");
        if (!response.ok) return new Set();
        const payload = await response.json().catch(() => ({}));
        const items = Array.isArray(payload?.items) ? payload.items : [];
        return new Set(
            items
                .filter((item) => String(item?.kind || "").toLowerCase() === "style")
                .map((item) => normalizeTag(item?.tag || ""))
                .filter(Boolean)
        );
    } catch (error) {
        logWarn("Failed to load favorite tag set", error);
        return new Set();
    }
}

export function buildRandomizedSlotState({
    state,
    artists,
    pinFavorites = false,
    favoriteTags = new Set(),
    allowedTags = null,
    excludeTags = null,
    randomFn = Math.random,
}) {
    const current = buildSlotStateWithLocks(state);
    const effectiveLockedSlots = buildEffectiveLockedSlots(current, pinFavorites, favoriteTags);
    const allowedTagSet = allowedTags instanceof Set ? new Set(
        [...allowedTags]
            .map((tag) => normalizeTag(tag))
            .filter(Boolean)
    ) : null;
    const excludedTagSet = excludeTags instanceof Set ? new Set(
        [...excludeTags]
            .map((tag) => normalizeTag(tag))
            .filter(Boolean)
    ) : null;
    const pool = uniqueArtists(artists).filter((artist) => !allowedTagSet || allowedTagSet.has(artist._queueTag));
    if (!pool.length) return current;

    const targetCount = current.tags.filter(Boolean).length;
    if (!targetCount) return current;
    const lockedTags = new Set(
        current.tags.filter((tag, slotIndex) => effectiveLockedSlots[slotIndex] && tag)
    );
    const availablePool = pool.filter((artist) => !lockedTags.has(artist._queueTag));
    const preferredPool = excludedTagSet
        ? availablePool.filter((artist) => !excludedTagSet.has(artist._queueTag))
        : availablePool;
    const fallbackPool = excludedTagSet
        ? availablePool.filter((artist) => excludedTagSet.has(artist._queueTag))
        : [];
    const randomizedPool = [
        ...shuffledArtists(preferredPool, randomFn),
        ...shuffledArtists(fallbackPool, randomFn),
    ];

    const nextTags = Array.from({ length: current.maxSlots }, (_, slotIndex) => (
        effectiveLockedSlots[slotIndex] ? current.tags[slotIndex] : ""
    ));

    let filled = nextTags.filter(Boolean).length;
    let randomIndex = 0;
    for (let slotIndex = 0; slotIndex < current.maxSlots && filled < targetCount; slotIndex += 1) {
        if (effectiveLockedSlots[slotIndex] || nextTags[slotIndex]) continue;
        const artist = randomizedPool[randomIndex++];
        if (!artist) break;
        nextTags[slotIndex] = artist._queueTag;
        filled += 1;
    }

    return {
        ...buildSlotState({
            tags: nextTags,
            currentSlot: current.currentSlot,
            maxSlots: current.maxSlots,
        }),
        lockedSlots: [...current.lockedSlots],
    };
}

export function buildNextArtistSlotState({
    state,
    artists,
    pinFavorites = false,
    favoriteTags = new Set(),
}) {
    const current = buildSlotStateWithLocks(state);
    const effectiveLockedSlots = buildEffectiveLockedSlots(current, pinFavorites, favoriteTags);
    const pool = uniqueArtists(artists);
    if (!pool.length) return current;

    const tagToIndex = new Map(pool.map((artist, index) => [artist._queueTag, index]));
    const nextTags = [...current.tags];

    nextTags.forEach((tag, slotIndex) => {
        if (!tag || effectiveLockedSlots[slotIndex]) return;
        const currentIndex = tagToIndex.get(tag);
        if (currentIndex == null) {
            nextTags[slotIndex] = pool[0]._queueTag;
            return;
        }
        nextTags[slotIndex] = pool[(currentIndex + 1) % pool.length]._queueTag;
    });

    return {
        ...buildSlotState({
            tags: nextTags,
            currentSlot: current.currentSlot,
            maxSlots: current.maxSlots,
        }),
        lockedSlots: [...current.lockedSlots],
    };
}

export function buildQueuedSlotState({
    state,
    artists,
    mode,
    pinFavorites = false,
    favoriteTags = new Set(),
    randomFn = Math.random,
}) {
    const current = buildSlotStateWithLocks(state);
    const normalizedMode = normalizeQueueMode(mode);
    if (normalizedMode === "next_artist") {
        return buildNextArtistSlotState({
            state: current,
            artists,
            pinFavorites,
            favoriteTags,
        });
    }
    if (normalizedMode === "random_artist") {
        return buildRandomizedSlotState({
            state: current,
            artists,
            pinFavorites,
            favoriteTags,
            randomFn,
        });
    }
    if (normalizedMode === "random_no_repeat") {
        return buildRandomizedSlotState({
            state: current,
            artists,
            pinFavorites,
            favoriteTags,
            excludeTags: new Set(current.tags.filter(Boolean)),
            randomFn,
        });
    }
    if (normalizedMode === "favorite_random") {
        return buildRandomizedSlotState({
            state: current,
            artists,
            pinFavorites,
            favoriteTags,
            allowedTags: favoriteTags,
            randomFn,
        });
    }
    if (normalizedMode === "favorite_no_repeat") {
        return buildRandomizedSlotState({
            state: current,
            artists,
            pinFavorites,
            favoriteTags,
            allowedTags: favoriteTags,
            excludeTags: new Set(current.tags.filter(Boolean)),
            randomFn,
        });
    }
    return current;
}

export function diffSlotStates(previousState, nextState) {
    const previous = buildSlotState(previousState);
    const next = buildSlotState(nextState);
    const changes = [];

    for (let i = 0; i < next.maxSlots; i += 1) {
        if (previous.tags[i] === next.tags[i]) continue;
        changes.push({
            slotIndex: i,
            previousTag: previous.tags[i],
            nextTag: next.tags[i],
        });
    }

    return changes;
}

export function resolveQueueAdvance({
    state,
    artists,
    mode,
    pinFavorites = false,
    favoriteTags = new Set(),
    randomFn = Math.random,
}) {
    const previousState = buildSlotStateWithLocks(state);
    const nextState = buildQueuedSlotState({
        state: previousState,
        artists,
        mode,
        pinFavorites,
        favoriteTags,
        randomFn,
    });
    const changes = diffSlotStates(previousState, nextState);
    const primaryTag = changes.find((entry) => entry.nextTag)?.nextTag || "";

    return {
        previousState,
        nextState,
        changes,
        primaryArtist: findArtistByTag(artists, primaryTag) || (primaryTag ? { tag: primaryTag } : null),
        changedArtists: changes.map((entry) => findArtistByTag(artists, entry.nextTag) || { tag: entry.nextTag }),
    };
}

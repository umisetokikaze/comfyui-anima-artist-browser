export const MIN_ARTIST_SLOTS = 1;

export function normalizeMaxSlots(value, fallback = MIN_ARTIST_SLOTS) {
    const count = Number(value);
    if (!Number.isFinite(count)) return Math.max(MIN_ARTIST_SLOTS, fallback);
    return Math.max(MIN_ARTIST_SLOTS, Math.trunc(count));
}

export function clampSlotIndex(value, maxSlots = MIN_ARTIST_SLOTS) {
    const index = Number(value);
    const slotCount = normalizeMaxSlots(maxSlots);
    if (!Number.isFinite(index)) return 0;
    return Math.max(0, Math.min(slotCount - 1, Math.trunc(index)));
}

export function normalizeArtist(value = "") {
    const display = String(value || "")
        .replace(/^@+/, "")
        .replace(/_/g, " ")
        .replace(/\s+/g, " ")
        .trim();

    return {
        display,
        tag: display ? display.replace(/\s+/g, "_") : "",
        token: display ? `@${display}` : "",
    };
}

export function normalizeSlotTags(tags = [], maxSlots = null) {
    const slotCount = normalizeMaxSlots(maxSlots ?? (Array.isArray(tags) ? tags.length : 0));
    const normalized = [];
    for (let i = 0; i < slotCount; i += 1) {
        normalized.push(normalizeArtist(tags[i] || "").tag);
    }
    return normalized;
}

export function buildSlotState({ tags = [], currentSlot = 0, maxSlots = null } = {}) {
    const resolvedMaxSlots = normalizeMaxSlots(maxSlots ?? (Array.isArray(tags) ? tags.length : 0));
    return {
        tags: normalizeSlotTags(tags, resolvedMaxSlots),
        currentSlot: clampSlotIndex(currentSlot, resolvedMaxSlots),
        maxSlots: resolvedMaxSlots,
    };
}

export function getNextEmptySlot(tags = []) {
    return tags.findIndex((tag) => !tag);
}

export function clearSlotState(state) {
    const next = buildSlotState(state);
    next.tags = Array.from({ length: next.maxSlots }, () => "");
    next.currentSlot = 0;
    return next;
}

export function applyArtistToSlotState(state, artist, options = {}) {
    const next = buildSlotState(state);
    const normalized = normalizeArtist(artist?.tag || artist?.token || artist?.display || artist || "");
    if (!normalized.tag) {
        return { ok: false, error: "Artist tag is empty." };
    }

    const forcedSlotIndex = Number.isInteger(options.slotIndex)
        ? clampSlotIndex(options.slotIndex, next.maxSlots)
        : null;
    const existingIndex = next.tags.findIndex((tag) => tag === normalized.tag);
    const preferCurrentSlot = !!options.preferCurrentSlot;

    let slotIndex = forcedSlotIndex ?? existingIndex;
    if (slotIndex < 0 && !preferCurrentSlot && forcedSlotIndex == null) {
        slotIndex = getNextEmptySlot(next.tags);
    }
    if (slotIndex < 0) {
        slotIndex = next.currentSlot;
    }

    next.tags[slotIndex] = normalized.tag;
    if (forcedSlotIndex != null || existingIndex >= 0 || preferCurrentSlot) {
        next.currentSlot = slotIndex;
    } else {
        next.currentSlot = (slotIndex + 1) % next.maxSlots;
    }

    return {
        ok: true,
        state: next,
        slotIndex,
        artist: normalized.display,
        tag: normalized.tag,
        token: normalized.token,
    };
}

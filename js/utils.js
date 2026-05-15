import { app } from "../../scripts/app.js";
import { CDN_BASE } from "./config.js";
import { applyNodeSlotState } from "./node_runtime.js";
import { readLockedSlots, writeLockedSlots } from "./queue_settings.js";
import {
    applyArtistToSlotState,
    buildSlotState,
    clampSlotIndex,
    clearSlotState,
    normalizeArtist,
    normalizeMaxSlots,
} from "./slot_state.js";

const ARTIST_WIDGET_PATTERNS = [
    { regex: /^artist_(\d+)$/, baseIndex: 1 },
    { regex: /^artists\.artist(\d+)$/, baseIndex: 0 },
    { regex: /^artist(\d+)$/, baseIndex: 0 },
];

export function thumbUrl(artist, useCustom = false) {
    if (!artist) return "";
    const id = artist.id ?? "";
    if (!id) return "";

    if (useCustom) {
        return `/anima/images/custom/${id}.webp`;
    }

    const page = artist.p ?? 1;
    const preferLocal = !!(artist?._preferLocalThumb || artist?.localPreviewCached);
    if (preferLocal) {
        return `/anima/images/${page}/${id}.webp`;
    }

    const isOnline = localStorage.getItem("anima_online") === "true";
    if (!isOnline) {
        return `/anima/images/${page}/${id}.webp`;
    }

    return `${CDN_BASE}/images/${page}/${id}.webp`;
}

function parseIndexedWidgetName(name, patterns = ARTIST_WIDGET_PATTERNS) {
    const value = String(name || "");
    for (const { regex, baseIndex } of patterns) {
        const match = value.match(regex);
        if (!match) continue;
        return Math.max(0, Number(match[1]) - baseIndex);
    }
    return null;
}

function getIndexedWidgets(node, patterns = ARTIST_WIDGET_PATTERNS) {
    const widgets = Array.isArray(node?.widgets) ? node.widgets : [];
    return widgets
        .map((widget) => ({
            widget,
            slotIndex: parseIndexedWidgetName(widget?.name, patterns),
        }))
        .filter((entry) => Number.isInteger(entry.slotIndex))
        .sort((a, b) => a.slotIndex - b.slotIndex);
}

function getArtistWidgets(node) {
    return getIndexedWidgets(node, ARTIST_WIDGET_PATTERNS);
}

function getArtistWidget(node, slotIndex) {
    return getArtistWidgets(node).find((entry) => entry.slotIndex === slotIndex)?.widget ?? null;
}

export function getNodeArtistSlotCount(node) {
    const widgetCount = getArtistWidgets(node).length;
    const tagCount = Array.isArray(node?._currentTags) ? node._currentTags.length : 0;
    return normalizeMaxSlots(Math.max(widgetCount, tagCount, 1));
}

function setWidgetValue(node, widget, value) {
    if (!widget) return;
    widget.value = value;
    if (widget.inputEl) {
        widget.inputEl.value = value;
        widget.inputEl.dispatchEvent(new Event("input", { bubbles: true }));
        widget.inputEl.dispatchEvent(new Event("change", { bubbles: true }));
    }
    if (widget.callback) widget.callback(value);
    node?.setDirtyCanvas?.(true, true);
    app.graph?.setDirtyCanvas?.(true, true);
}

function readNodeSlotState(node) {
    const artistWidgets = getArtistWidgets(node);
    const tags = artistWidgets.length
        ? artistWidgets.map(({ widget }) => normalizeArtist(widget?.value || "").tag)
        : Array.isArray(node?._currentTags)
            ? [...node._currentTags]
            : [];
    const state = buildSlotState({
        tags,
        currentSlot: node?._currentSlot ?? 0,
        maxSlots: getNodeArtistSlotCount(node),
    });
    return {
        ...state,
        lockedSlots: readLockedSlots(node, state.maxSlots),
    };
}

export function syncArtistState(node) {
    return applyNodeSlotState(node, readNodeSlotState(node));
}

export function getNodeSlotState(node) {
    return syncArtistState(node);
}

function setArtistSlot(node, slotIndex, value) {
    const widget = getArtistWidget(node, slotIndex);
    if (!widget) return false;
    setWidgetValue(node, widget, value);
    syncArtistState(node);
    return true;
}

export function replaceArtistSlots(node, tags = [], currentSlot = 0, lockedSlots = null) {
    const current = getNodeSlotState(node);
    const next = buildSlotState({
        tags,
        currentSlot,
        maxSlots: getNodeArtistSlotCount(node),
    });
    const nextLockedSlots = Array.isArray(lockedSlots) ? lockedSlots : current.lockedSlots;

    for (let i = 0; i < next.maxSlots; i += 1) {
        setArtistSlot(node, i, next.tags[i] ? `@${next.tags[i].replace(/_/g, " ")}` : "");
    }

    applyNodeSlotState(node, {
        ...next,
        lockedSlots: nextLockedSlots,
    });
    node?.setDirtyCanvas?.(true, true);
    app.graph?.setDirtyCanvas?.(true, true);
    return {
        ...next,
        lockedSlots: [...nextLockedSlots],
    };
}

export function setCurrentArtistSlot(node, slotIndex) {
    const next = buildSlotState({
        ...getNodeSlotState(node),
        currentSlot: slotIndex,
    });
    applyNodeSlotState(node, next);
    node?.setDirtyCanvas?.(true, true);
    app.graph?.setDirtyCanvas?.(true, true);
    return next.currentSlot;
}

export function clearArtistSlots(node) {
    const current = getNodeSlotState(node);
    const next = {
        ...clearSlotState(current),
        lockedSlots: current.lockedSlots,
    };
    for (let i = 0; i < next.maxSlots; i += 1) {
        setArtistSlot(node, i, "");
    }
    applyNodeSlotState(node, next);
}

export function setArtistSlotLocked(node, slotIndex, value) {
    const current = getNodeSlotState(node);
    const nextSlotIndex = clampSlotIndex(slotIndex, current.maxSlots);
    const nextLockedSlots = [...current.lockedSlots];
    nextLockedSlots[nextSlotIndex] = !!value;
    writeLockedSlots(node, nextLockedSlots, current.maxSlots);
    const next = applyNodeSlotState(node, {
        ...current,
        lockedSlots: nextLockedSlots,
    });
    node?.setDirtyCanvas?.(true, true);
    app.graph?.setDirtyCanvas?.(true, true);
    return {
        slotIndex: nextSlotIndex,
        locked: !!next.lockedSlots[nextSlotIndex],
        state: next,
    };
}

export function toggleCurrentArtistSlotLock(node) {
    const current = getNodeSlotState(node);
    const slotIndex = current.currentSlot;
    return setArtistSlotLocked(node, slotIndex, !current.lockedSlots[slotIndex]);
}

export function applyStyle(node, artist, options = {}) {
    const result = applyArtistToSlotState(getNodeSlotState(node), artist, options);
    if (!result.ok) return result;

    const ok = setArtistSlot(node, result.slotIndex, result.token);
    if (!ok) {
        return { ok: false, error: `Artist slot ${result.slotIndex + 1} not found.` };
    }

    applyNodeSlotState(node, result.state);

    return {
        ok: true,
        slotIndex: result.slotIndex,
        artist: result.artist,
        token: result.token,
    };
}

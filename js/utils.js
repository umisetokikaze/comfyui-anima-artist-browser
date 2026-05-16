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
const PRIMITIVE_NODE_TYPES = new Set(["PrimitiveNode", "PrimitiveString", "PrimitiveStringMultiline"]);
const PRIMITIVE_CREATE_TYPES = ["PrimitiveNode", "PrimitiveString", "PrimitiveStringMultiline"];

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

function parseIndexedSlotName(names = [], patterns = ARTIST_WIDGET_PATTERNS) {
    for (const name of names) {
        const slotIndex = parseIndexedWidgetName(name, patterns);
        if (Number.isInteger(slotIndex)) return slotIndex;
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

function getIndexedInputs(node, patterns = ARTIST_WIDGET_PATTERNS) {
    const inputs = Array.isArray(node?.inputs) ? node.inputs : [];
    return inputs
        .map((input, inputIndex) => ({
            input,
            inputIndex,
            slotIndex: parseIndexedSlotName([input?.widget?.name, input?.name], patterns),
        }))
        .filter((entry) => Number.isInteger(entry.slotIndex))
        .sort((a, b) => a.slotIndex - b.slotIndex);
}

function getArtistWidgets(node) {
    return getIndexedWidgets(node, ARTIST_WIDGET_PATTERNS);
}

function getArtistInputs(node) {
    return getIndexedInputs(node, ARTIST_WIDGET_PATTERNS);
}

function getArtistSlotEntries(node) {
    const entries = new Map();

    for (const { widget, slotIndex } of getArtistWidgets(node)) {
        entries.set(slotIndex, {
            slotIndex,
            widget,
            input: null,
            inputIndex: -1,
        });
    }

    for (const { input, inputIndex, slotIndex } of getArtistInputs(node)) {
        const current = entries.get(slotIndex) || {
            slotIndex,
            widget: null,
            input: null,
            inputIndex: -1,
        };
        current.input = input;
        current.inputIndex = inputIndex;
        entries.set(slotIndex, current);
    }

    return [...entries.values()].sort((a, b) => a.slotIndex - b.slotIndex);
}

function getArtistSlotEntry(node, slotIndex) {
    return getArtistSlotEntries(node).find((entry) => entry.slotIndex === slotIndex) ?? null;
}

function getGraphLink(graph, linkId) {
    if (!graph || linkId == null || graph.links == null) return null;
    if (typeof graph.links.get === "function") return graph.links.get(linkId) || null;
    return graph.links[linkId] || null;
}

function getGraphNodeById(graph, nodeId) {
    if (!graph || nodeId == null) return null;
    if (typeof graph.getNodeById === "function") return graph.getNodeById(nodeId) || null;
    if (graph._nodes_by_id?.get) return graph._nodes_by_id.get(nodeId) || null;
    return graph._nodes_by_id?.[nodeId] || null;
}

function getNodeTypeName(node) {
    return String(
        node?.comfyClass
        || node?.type
        || node?.constructor?.comfyClass
        || node?.constructor?.type
        || node?.constructor?.nodeData?.name
        || node?.properties?.["Node name for S&R"]
        || ""
    );
}

function getWidgetByName(node, name) {
    const widgets = Array.isArray(node?.widgets) ? node.widgets : [];
    return widgets.find((widget) => String(widget?.name || "") === name) ?? null;
}

function getPrimitiveValueWidget(node) {
    return getWidgetByName(node, "value");
}

function getInputSlotWidget(node, input) {
    if (!input) return null;
    const widgetFromSlot = node?.getWidgetFromSlot?.(input);
    if (widgetFromSlot) return widgetFromSlot;
    const widgetName = String(input?.widget?.name || "");
    if (!widgetName) return null;
    return getWidgetByName(node, widgetName);
}

function resolveLinkedNode(node, input) {
    const graph = node?.graph || app.graph;
    const link = getGraphLink(graph, input?.link);
    return {
        graph,
        link,
        originNode: link ? getGraphNodeById(graph, link.origin_id) : null,
    };
}

function isStringPrimitiveNode(node) {
    if (PRIMITIVE_NODE_TYPES.has(getNodeTypeName(node))) {
        return true;
    }

    const title = String(node?.title || node?.constructor?.nodeData?.display_name || "");
    const hasStringOutput = String(node?.outputs?.[0]?.type || "") === "STRING";
    const hasValueWidget = !!getPrimitiveValueWidget(node);
    return hasValueWidget && hasStringOutput && (title === "String" || title === "String (Multiline)");
}

function hasConnectionResult(value) {
    return value !== null && value !== undefined && value !== false;
}

function connectArtistPrimitive(primitive, node, entry) {
    if (!primitive || !node || !entry?.input) return null;

    if (typeof primitive.connect === "function") {
        const byIndex = primitive.connect(0, node, entry.inputIndex);
        if (hasConnectionResult(byIndex)) return byIndex;

        const byName = primitive.connect(0, node, entry.input.name);
        if (hasConnectionResult(byName)) return byName;
    }

    const output = Array.isArray(primitive.outputs) ? primitive.outputs[0] : null;
    if (output && typeof primitive.connectSlots === "function") {
        const link = primitive.connectSlots(output, node, entry.input, undefined);
        if (hasConnectionResult(link)) return link;
    }

    return null;
}

function readArtistSlotToken(node, entry) {
    if (!entry) {
        return "";
    }

    if (entry.input?.link != null) {
        const { link, originNode } = resolveLinkedNode(node, entry.input);
        if (link && originNode && isStringPrimitiveNode(originNode)) {
            return String(getPrimitiveValueWidget(originNode)?.value || "");
        }
        if (link) return "";
    }

    const widget = entry.widget || getInputSlotWidget(node, entry.input);
    return String(widget?.value || "");
}

function disconnectMissingInputLink(node, entry) {
    if (!entry?.input || entry.input.link == null) return false;
    const { link } = resolveLinkedNode(node, entry.input);
    if (link) return false;
    node?.disconnectInput?.(entry.inputIndex);
    entry.input.link = null;
    return true;
}

function createPrimitiveNode(createNode) {
    for (const type of PRIMITIVE_CREATE_TYPES) {
        try {
            const node = createNode(type);
            if (node) return node;
        } catch {
            // Try the next known primitive type for older or newer ComfyUI frontends.
        }
    }
    return null;
}

function ensureArtistPrimitive(node, entry) {
    const graph = node?.graph || app.graph;
    const createNode = globalThis.LiteGraph?.createNode;

    if (!graph || typeof createNode !== "function") {
        return { ok: false, error: `Artist slot ${entry.slotIndex + 1} is not ready.` };
    }

    if (entry?.input?.link != null && !getGraphLink(graph, entry.input.link)) {
        node.disconnectInput?.(entry.inputIndex);
    }

    const primitive = createPrimitiveNode(createNode);
    if (!primitive) {
        return { ok: false, error: `Could not create artist slot ${entry.slotIndex + 1}.` };
    }

    const [x, y] = Array.isArray(node?.pos) ? node.pos : [0, 0];
    primitive.pos = [Number(x) - 260, Number(y) + (entry.slotIndex * 26)];
    primitive.title = `Artist S${entry.slotIndex + 1}`;
    primitive.properties = {
        ...(primitive.properties || {}),
        _animaManaged: true,
    };

    graph.beforeChange?.();
    try {
        graph.add?.(primitive);
        const link = connectArtistPrimitive(primitive, node, entry);
        if (!hasConnectionResult(link)) {
            graph.remove?.(primitive);
            return { ok: false, error: `Could not connect artist slot ${entry.slotIndex + 1}.` };
        }
    } finally {
        graph.afterChange?.();
    }

    return { ok: true, primitive };
}

function writeArtistSlot(node, slotIndex, value, { sync = true } = {}) {
    const entry = getArtistSlotEntry(node, slotIndex);
    if (!entry) {
        return { ok: false, error: `Artist slot ${slotIndex + 1} not found.` };
    }

    disconnectMissingInputLink(node, entry);

    if (entry.input?.link != null) {
        const { originNode } = resolveLinkedNode(node, entry.input);
        if (!originNode || !isStringPrimitiveNode(originNode)) {
            return {
                ok: false,
                error: `Artist slot ${slotIndex + 1} is connected to ${String(originNode?.title || getNodeTypeName(originNode) || "another node")}.`,
            };
        }

        const widget = getPrimitiveValueWidget(originNode);
        if (!widget) {
            return { ok: false, error: `Artist slot ${slotIndex + 1} is missing a value control.` };
        }

        setWidgetValue(originNode, widget, value);
        if (sync) syncArtistState(node);
        return { ok: true };
    }

    const widget = entry.widget || getInputSlotWidget(node, entry.input);
    if (widget) {
        setWidgetValue(node, widget, value);
        if (sync) syncArtistState(node);
        return { ok: true };
    }

    if (!entry.input) {
        return { ok: false, error: `Artist slot ${slotIndex + 1} not found.` };
    }

    if (!value) {
        if (sync) syncArtistState(node);
        return { ok: true };
    }

    const created = ensureArtistPrimitive(node, entry);
    if (!created.ok) return created;

    const primitiveWidget = getPrimitiveValueWidget(created.primitive);
    if (!primitiveWidget) {
        return { ok: false, error: `Could not initialize artist slot ${slotIndex + 1}.` };
    }

    setWidgetValue(created.primitive, primitiveWidget, value);
    if (sync) syncArtistState(node);
    return { ok: true };
}

export function getNodeArtistSlotCount(node) {
    const slotCount = getArtistSlotEntries(node).reduce(
        (count, entry) => Math.max(count, entry.slotIndex + 1),
        0
    );
    const tagCount = Array.isArray(node?._currentTags) ? node._currentTags.length : 0;
    return normalizeMaxSlots(Math.max(slotCount, tagCount, 1));
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
    const artistSlots = getArtistSlotEntries(node);
    const maxSlots = getNodeArtistSlotCount(node);
    const tags = artistSlots.length
        ? Array.from({ length: maxSlots }, (_, slotIndex) => {
            const entry = artistSlots.find((item) => item.slotIndex === slotIndex);
            return normalizeArtist(readArtistSlotToken(node, entry)).tag;
        })
        : Array.isArray(node?._currentTags)
            ? [...node._currentTags]
            : [];
    const state = buildSlotState({
        tags,
        currentSlot: node?._currentSlot ?? 0,
        maxSlots,
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

export function replaceArtistSlots(node, tags = [], currentSlot = 0, lockedSlots = null) {
    const current = getNodeSlotState(node);
    const next = buildSlotState({
        tags,
        currentSlot,
        maxSlots: getNodeArtistSlotCount(node),
    });
    const nextLockedSlots = Array.isArray(lockedSlots) ? lockedSlots : current.lockedSlots;

    for (let i = 0; i < next.maxSlots; i += 1) {
        writeArtistSlot(node, i, next.tags[i] ? `@${next.tags[i].replace(/_/g, " ")}` : "", { sync: false });
    }

    const synced = readNodeSlotState(node);
    applyNodeSlotState(node, {
        ...synced,
        currentSlot: next.currentSlot,
        maxSlots: next.maxSlots,
        lockedSlots: nextLockedSlots,
    });
    node?.setDirtyCanvas?.(true, true);
    app.graph?.setDirtyCanvas?.(true, true);
    return {
        ...synced,
        currentSlot: next.currentSlot,
        maxSlots: next.maxSlots,
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
    const next = clearSlotState(current);
    return replaceArtistSlots(node, next.tags, next.currentSlot, current.lockedSlots);
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

    const writeResult = writeArtistSlot(node, result.slotIndex, result.token);
    if (!writeResult.ok) {
        return { ok: false, error: writeResult.error || `Artist slot ${result.slotIndex + 1} not found.` };
    }

    applyNodeSlotState(node, result.state);

    return {
        ok: true,
        slotIndex: result.slotIndex,
        artist: result.artist,
        token: result.token,
    };
}

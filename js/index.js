import { app } from "../../scripts/app.js";
import { injectCSS } from "./styles.js";
import { AutoCycle } from "./autocycle.js";
import { logWarn } from "./logger.js";
import { syncArtistState } from "./utils.js";
import { ensureQueuePromptHook } from "./queue_behavior.js";
import { ensureNodeWidgets } from "./node_ui.js";
import {
    ensureNodeRuntime,
    ensureResizePersistence,
    normalizeSizePair,
    readStoredNodeSize,
    scheduleNodeTimer,
} from "./node_runtime.js";

const LAYOUT_REFRESH_DELAYS = [140, 360];
const INITIAL_GRAPH_SWEEP_DELAYS = [0, 320];

function isAnimaNode(node) {
    const names = [
        node?.comfyClass,
        node?.type,
        node?.constructor?.comfyClass,
        node?.constructor?.nodeData?.name,
        node?.constructor?.nodeData?.display_name,
        node?.title,
    ].map((value) => String(value || ""));
    if (names.some((value) => value === "AnimaArtistBrowser" || value.includes("Anima Artist Browser"))) {
        return true;
    }

    const hasArtistInput = (node?.inputs || []).some((input) => /^(artists\.artist\d+|artist\d+|artist_\d+)$/.test(String(input?.name || input?.widget?.name || "")));
    const hasArtistOutput = (node?.outputs || []).some((output) => String(output?.name || output?.label || "").includes("artist_string"));
    return hasArtistInput && hasArtistOutput;
}

function refreshNodeCanvas(node) {
    if (!node) return;
    try {
        node.setDirtyCanvas?.(true, true);
        app.graph?.setDirtyCanvas?.(true, true);
    } catch (error) {
        logWarn("Failed to refresh node canvas", error);
    }
}

function isNodeAlive(node) {
    return !!node && Array.isArray(app.graph?._nodes) && app.graph._nodes.includes(node);
}

function growNodeIfNeeded(node) {
    if (!node) return;
    try {
        const current = normalizeSizePair(node.size) || [0, 0];
        const stored = readStoredNodeSize(node) || current;
        const computed = Array.isArray(node.computeSize?.()) ? node.computeSize() : null;
        if (!computed || computed.length !== 2) {
            refreshNodeCanvas(node);
            return;
        }

        const next = [
            Math.max(stored[0], Number(computed[0]) || 0),
            Math.max(stored[1], Number(computed[1]) || 0),
        ];

        if (next[0] !== current[0] || next[1] !== current[1]) {
            node.setSize?.(next);
        }
        refreshNodeCanvas(node);
    } catch (error) {
        logWarn("Failed to resize Anima node", error);
    }
}

function patchNode(node, force = false) {
    if (!node || (!force && !isAnimaNode(node))) return;
    ensureNodeRuntime(node);
    ensureResizePersistence(node);
    try {
        syncArtistState(node);
    } catch (error) {
        logWarn("Failed to sync Anima artist slot state", error);
    }

    const nodeUiChanged = ensureNodeWidgets(node, { refreshNodeCanvas });

    growNodeIfNeeded(node);

    if (nodeUiChanged) {
        LAYOUT_REFRESH_DELAYS.forEach((delay, index) => {
            scheduleNodeTimer(node, `layout_${index}`, delay, () => {
                if (!isNodeAlive(node)) return;
                growNodeIfNeeded(node);
            });
        });
    }
}

function ensureNodeUi(node, force = false) {
    patchNode(node, force);
}

function patchExistingNodes() {
    const nodes = app.graph?._nodes || [];
    for (const node of nodes) {
        ensureNodeUi(node);
    }
}

AutoCycle.subscribe(({ node }) => {
    if (!node) return;
    ensureNodeUi(node, true);
    refreshNodeCanvas(node);
});

app.registerExtension({
    name: "AnimaArtistBrowser",

    async beforeRegisterNodeDef(nodeType, nodeData) {
        if (nodeData.name !== "AnimaArtistBrowser") return;
        injectCSS();

        const origOnNodeCreated = nodeType.prototype.onNodeCreated;
        nodeType.prototype.onNodeCreated = function () {
            origOnNodeCreated?.apply(this, arguments);
            ensureNodeUi(this, true);
        };
    },

    nodeCreated(node) {
        ensureNodeUi(node);
    },

    loadedGraphNode(node) {
        ensureNodeUi(node);
    },

    setup() {
        ensureQueuePromptHook({
            isAnimaNode,
            isNodeAlive,
            refreshNodeCanvas,
        });
        INITIAL_GRAPH_SWEEP_DELAYS.forEach((delay) => {
            setTimeout(() => {
                patchExistingNodes();
            }, delay);
        });
    },
});

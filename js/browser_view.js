import { nextRenderId } from "./browser_store.js";
import { countActiveArtistFilters, normalizeArtistFilters } from "./browser_renderers.js";
import { getNodeSlotState, setCurrentArtistSlot } from "./utils.js";

export function createBrowserView({
    store,
    controller,
    dataApi,
    renderChunkedGrid,
    buildStyleList,
    buildFavoritesList,
    createStyleCard,
    thumbUrl,
    showToast,
    swipe,
}) {
    function setCategoryTabs() {
        if (!store.el) return;
        store.el.querySelector("#anima-cat-all").style.opacity = store.category === "all" ? "1" : "0.5";
        store.el.querySelector("#anima-cat-favorites").style.opacity = store.category === "favorites" ? "1" : "0.5";
        const sortSelect = store.el.querySelector(".hdr-select");
        if (sortSelect) sortSelect.disabled = store.category !== "all";
    }

    function formatFilterNumber(value) {
        return Number(value).toLocaleString(undefined, { maximumFractionDigits: 2 });
    }

    function refreshFilterSummary() {
        const summaryEl = store.el?.querySelector("#anima-filter-summary");
        if (!summaryEl) return;

        const filters = normalizeArtistFilters(store.artistFilters);
        const activeCount = countActiveArtistFilters(filters);
        if (!activeCount) {
            summaryEl.textContent = "Multi-word search plus works, uniqueness, and favorites filters";
            return;
        }

        const parts = [];
        if (filters.query) parts.push(`search "${filters.query}"`);
        if (filters.worksMin != null || filters.worksMax != null) {
            const min = filters.worksMin != null ? formatFilterNumber(filters.worksMin) : "any";
            const max = filters.worksMax != null ? formatFilterNumber(filters.worksMax) : "any";
            parts.push(`works ${min} - ${max}`);
        }
        if (filters.uniquenessMin != null || filters.uniquenessMax != null) {
            const min = filters.uniquenessMin != null ? formatFilterNumber(filters.uniquenessMin) : "any";
            const max = filters.uniquenessMax != null ? formatFilterNumber(filters.uniquenessMax) : "any";
            parts.push(`uniq ${min} - ${max}`);
        }
        if (filters.favoritesOnly) parts.push("favorited only");

        summaryEl.textContent = `${activeCount} active · ${parts.join(" · ")}`;
    }

    function renderSlotButtons(state) {
        const slotList = store.el?.querySelector("#anima-slot-list");
        if (!slotList) return [];

        if (!state) {
            slotList.innerHTML = `
                <button class="slot-chip" data-slot-index="0" type="button" disabled>
                    <span class="slot-chip-id">S1</span>
                    <span class="slot-chip-tag">(empty)</span>
                </button>
            `;
            return [...slotList.querySelectorAll(".slot-chip")];
        }

        slotList.innerHTML = Array.from({ length: state.maxSlots }, (_, index) => `
            <button class="slot-chip" data-slot-index="${index}" type="button">
                <span class="slot-chip-id">S${index + 1}</span>
                <span class="slot-chip-tag">(empty)</span>
            </button>
        `).join("");
        return [...slotList.querySelectorAll(".slot-chip")];
    }

    function refreshSlotSummary() {
        if (!store.el) return;
        const slotHint = store.el.querySelector("#anima-slot-hint");
        const activeNode = store.activeNode;
        const state = activeNode ? getNodeSlotState(activeNode) : null;
        const slotButtons = renderSlotButtons(state);

        if (!state) {
            if (slotHint) slotHint.textContent = "Open from a node to target slots directly";
            return;
        }

        if (slotHint) slotHint.textContent = `Active slot S${state.currentSlot + 1} of ${state.maxSlots} · click a chip to retarget apply actions`;
        slotButtons.forEach((button, index) => {
            const tag = state.tags[index];
            button.classList.toggle("active", index === state.currentSlot);
            button.querySelector(".slot-chip-tag").textContent = tag ? `@${String(tag).replace(/_/g, " ")}` : "(empty)";
            button.disabled = false;
        });
    }

    function setActiveSlot(slotIndex) {
        if (!store.activeNode) return null;
        const currentSlot = setCurrentArtistSlot(store.activeNode, slotIndex);
        refreshSlotSummary();
        return currentSlot;
    }

    async function applyArtist(artist, anchorEl = null, options = {}) {
        if (Number.isInteger(options.slotIndex) && store.activeNode) {
            setActiveSlot(options.slotIndex);
        }
        const result = await store.onPick?.(artist, options);
        if (result?.ok === false) {
            showToast(result.error || "Could not apply artist", "error", 1800, { anchor: anchorEl });
            return result;
        }
        highlight(artist?.tag || "");
        refreshSlotSummary();
        const slotLabel = Number.isInteger(result?.slotIndex) ? ` to S${result.slotIndex + 1}` : "";
        showToast(`Applied @${String(artist?.tag || "").replace(/_/g, " ")}${slotLabel}`, "success", 1500, { anchor: anchorEl });
        return result;
    }

    async function openSwipe(startIndex) {
        if (!store.lastList.length) await render();
        if (!store.lastList.length) return;

        const boundedStart = Math.max(0, Math.min(Number(startIndex) || 0, store.lastList.length - 1));
        swipe.open({
            list: store.lastList,
            startIndex: boundedStart,
            onApply: (artist, anchorEl = null) => applyArtist(artist, anchorEl),
            onToggleFavorite: async (selectedArtist, anchorEl = null) => {
                const result = await controller.toggleStyleFavorite(selectedArtist, anchorEl, { rerenderFavorites: renderFavorites });
                if (result?.ok && store.category === "all" && store.artistFilters?.favoritesOnly) {
                    await render();
                }
                return result;
            },
            isFavorited: (selectedArtist) => controller.isFavorited(selectedArtist),
            getSlotState: () => {
                if (!store.activeNode) return null;
                return getNodeSlotState(store.activeNode);
            },
            getImageUrl: (artist) => thumbUrl(artist, false),
            getTitle: (artist) => String(artist?.tag || "").replace(/_/g, " "),
        });
    }

    async function renderFavorites() {
        const id = nextRenderId(store);
        store.grid.innerHTML = `<div class="anima-empty"><div class="anima-spinner"></div><span>Loading favorites...</span></div>`;
        refreshFilterSummary();

        await controller.loadLocalFavorites();
        if (id !== store.renderId) return;

        const artists = await dataApi.all();
        if (id !== store.renderId) return;

        const list = buildFavoritesList({
            artists,
            localFavorites: store.localFavorites,
            filters: store.artistFilters,
        });

        store.countEl.textContent = `${list.length} favorites`;
        store.lastList = list;
        store.el.querySelector(".body").scrollTop = 0;

        if (!list.length) {
            if (store.observer) store.observer.disconnect();
            const hasActiveFilters = countActiveArtistFilters(store.artistFilters) > 0;
            const message = store.localFavorites.length && hasActiveFilters
                ? "No favorites match current filters."
                : "No favorites yet.";
            store.grid.innerHTML = `<div class="anima-empty"><span>${message}</span></div>`;
            return;
        }

        renderChunkedGrid({
            grid: store.grid,
            observer: store.observer,
            items: list,
            chunkSize: 60,
            minHeight: "400px",
            renderItem: (artist) => card(artist),
        });
    }

    async function render() {
        if (store.category === "favorites") return renderFavorites();

        const id = nextRenderId(store);
        store.grid.innerHTML = `<div class="anima-empty"><div class="anima-spinner"></div><span>Loading styles...</span></div>`;
        refreshFilterSummary();
        const full = await dataApi.all();
        if (id !== store.renderId) return;

        const list = buildStyleList(full, {
            sort: store.sort,
            filters: store.artistFilters,
            favoriteMap: store.favoriteMap,
        });
        store.countEl.textContent = `${list.length} styles`;
        store.lastList = list;
        store.el.querySelector(".body").scrollTop = 0;

        if (!list.length) {
            if (store.observer) store.observer.disconnect();
            store.grid.innerHTML = `<div class="anima-empty"><span>No styles match current filters.</span></div>`;
            return;
        }

        renderChunkedGrid({
            grid: store.grid,
            observer: store.observer,
            items: list,
            chunkSize: 100,
            minHeight: "400px",
            renderItem: (artist) => card(artist),
        });
    }

    function card(artist) {
        return createStyleCard({
            artist,
            imageUrl: thumbUrl(artist, false),
            isUniq: store.sort === "uniqueness",
            isFav: controller.isFavorited(artist),
            onApply: (selectedArtist, anchorEl = null) => applyArtist(selectedArtist, anchorEl),
            onToggleFavorite: async (selectedArtist, _btn, anchorEl = null) => {
                const result = await controller.toggleStyleFavorite(selectedArtist, anchorEl, { rerenderFavorites: renderFavorites });
                if (result?.ok && store.category === "all" && store.artistFilters?.favoritesOnly) {
                    await render();
                }
                return result;
            },
            onOpenSwipe: (selectedArtist) => {
                const idx = store.lastList.findIndex((item) => item.tag === selectedArtist.tag);
                openSwipe(idx >= 0 ? idx : 0);
            },
        });
    }

    function highlight(tag) {
        store.lastHighlightedTag = tag || "";
        store.grid.querySelectorAll(".anima-card.selected").forEach((cardEl) => cardEl.classList.remove("selected"));
        if (!tag) return;
        const escaped = CSS.escape(tag);
        store.grid.querySelector(`.anima-card[data-tag="${escaped}"]`)?.classList.add("selected");
    }

    return {
        setCategoryTabs,
        refreshSlotSummary,
        setActiveSlot,
        openSwipe,
        renderFavorites,
        render,
        highlight,
        refreshFilterSummary,
    };
}

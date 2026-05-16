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

    function getRenderedCards() {
        return store.grid ? [...store.grid.querySelectorAll(".anima-card[data-tag]")] : [];
    }

    function getCardByTag(tag) {
        if (!store.grid || !tag) return null;
        return store.grid.querySelector(`.anima-card[data-tag="${CSS.escape(tag)}"]`);
    }

    function getCardAnchorByTag(tag) {
        return getCardByTag(tag)?.querySelector(".anima-card-img") || null;
    }

    function findArtistByTag(tag) {
        const target = String(tag || "").trim();
        if (!target) return null;
        return store.lastList.find((artist) => String(artist?.tag || "") === target) || null;
    }

    function getPreferredHighlightTag() {
        const currentTag = String(store.lastHighlightedTag || "").trim();
        if (currentTag && findArtistByTag(currentTag)) {
            return currentTag;
        }

        const activeNode = store.activeNode;
        const slotState = activeNode ? getNodeSlotState(activeNode) : null;
        const activeSlotTag = String(slotState?.tags?.[slotState?.currentSlot] || "").trim();
        if (activeSlotTag && findArtistByTag(activeSlotTag)) {
            return activeSlotTag;
        }

        return String(store.lastList[0]?.tag || "").trim();
    }

    function syncHighlightedCards({ scroll = false } = {}) {
        const selectedTag = String(store.lastHighlightedTag || "").trim();
        const cards = getRenderedCards();
        cards.forEach((cardEl) => {
            cardEl.classList.toggle("selected", cardEl.dataset.tag === selectedTag);
        });

        const selectedCard = selectedTag ? getCardByTag(selectedTag) : null;
        if (scroll && selectedCard) {
            selectedCard.scrollIntoView({ block: "nearest", inline: "nearest" });
        }
        return selectedCard;
    }

    function highlight(tag, options = {}) {
        store.lastHighlightedTag = String(tag || "").trim();
        return syncHighlightedCards(options);
    }

    function ensureHighlightedArtist(options = {}) {
        const nextTag = getPreferredHighlightTag();
        if (!nextTag) {
            highlight("");
            return null;
        }

        if (nextTag !== store.lastHighlightedTag) {
            highlight(nextTag, options);
        } else {
            syncHighlightedCards(options);
        }
        return findArtistByTag(nextTag);
    }

    function getGridColumnCount() {
        const cards = getRenderedCards();
        if (cards.length <= 1) return 1;
        const firstTop = cards[0].offsetTop;
        let columns = 0;
        for (const cardEl of cards) {
            if (Math.abs(cardEl.offsetTop - firstTop) > 6) break;
            columns += 1;
        }
        return Math.max(1, columns);
    }

    function moveHighlight(delta, { vertical = false } = {}) {
        const cards = getRenderedCards();
        if (!cards.length) return false;

        const currentTag = String(store.lastHighlightedTag || "").trim();
        let currentIndex = cards.findIndex((cardEl) => cardEl.dataset.tag === currentTag);
        if (currentIndex < 0) {
            const edgeCard = cards[delta >= 0 ? 0 : cards.length - 1];
            if (!edgeCard?.dataset?.tag) return false;
            highlight(edgeCard.dataset.tag, { scroll: true });
            return true;
        }

        const step = vertical ? getGridColumnCount() : 1;
        const nextIndex = Math.max(0, Math.min(currentIndex + (delta * step), cards.length - 1));
        const nextCard = cards[nextIndex];
        if (!nextCard?.dataset?.tag) return false;
        highlight(nextCard.dataset.tag, { scroll: true });
        return true;
    }

    async function writeClipboardText(text) {
        const value = String(text || "").trim();
        if (!value) return false;

        if (navigator.clipboard?.writeText) {
            try {
                await navigator.clipboard.writeText(value);
                return true;
            } catch {
                // Fall back to the legacy execCommand path when Clipboard API is unavailable.
            }
        }

        try {
            const input = document.createElement("textarea");
            input.value = value;
            input.setAttribute("readonly", "true");
            input.style.position = "fixed";
            input.style.opacity = "0";
            document.body.appendChild(input);
            input.focus();
            input.select();
            const ok = document.execCommand("copy");
            input.remove();
            return !!ok;
        } catch {
            return false;
        }
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

        if (slotHint) {
            const modeText = store.manualSlotTarget
                ? "targeting selected slot"
                : "fills next empty slot";
            slotHint.textContent = `Active slot S${state.currentSlot + 1} of ${state.maxSlots} · ${modeText} · click a chip to target directly`;
        }
        slotButtons.forEach((button, index) => {
            const tag = state.tags[index];
            button.classList.toggle("active", index === state.currentSlot);
            button.querySelector(".slot-chip-tag").textContent = tag ? `@${String(tag).replace(/_/g, " ")}` : "(empty)";
            button.disabled = false;
        });
    }

    function setActiveSlot(slotIndex, { manual = true } = {}) {
        if (!store.activeNode) return null;
        if (manual) store.manualSlotTarget = true;
        const currentSlot = setCurrentArtistSlot(store.activeNode, slotIndex);
        refreshSlotSummary();
        return currentSlot;
    }

    async function applyArtist(artist, anchorEl = null, options = {}) {
        const applyOptions = { ...options };
        if (Number.isInteger(options.slotIndex) && store.activeNode) {
            setActiveSlot(options.slotIndex);
        }
        if (store.manualSlotTarget && !Number.isInteger(applyOptions.slotIndex)) {
            const state = store.activeNode ? getNodeSlotState(store.activeNode) : null;
            if (Number.isInteger(state?.currentSlot)) {
                applyOptions.slotIndex = state.currentSlot;
            } else if (applyOptions.preferCurrentSlot == null) {
                applyOptions.preferCurrentSlot = true;
            }
        }
        const result = await store.onPick?.(artist, applyOptions);
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

    async function copyArtistTag(artist, anchorEl = null) {
        const tag = String(artist?.tag || "").trim();
        if (!tag) {
            return { ok: false, error: "Artist tag unavailable." };
        }

        const copiedText = `@${tag.replace(/_/g, " ")}`;
        const copied = await writeClipboardText(copiedText);
        if (!copied) {
            showToast("Could not copy artist tag", "error", 1700, { anchor: anchorEl });
            return { ok: false, error: "Could not copy artist tag." };
        }

        highlight(tag);
        showToast(`Copied ${copiedText}`, "success", 1200, { anchor: anchorEl });
        return { ok: true, value: copiedText };
    }

    function syncCardFavoriteState(tag, favorited) {
        const cardEl = getCardByTag(tag);
        if (!cardEl) return;
        cardEl.querySelector(".anima-card-favorite-badge")?.classList.toggle("active", !!favorited);
        const favoriteButton = cardEl.querySelector(".anima-card-fav");
        if (favoriteButton) {
            favoriteButton.textContent = favorited ? "Unfavorite" : "Favorite";
        }
    }

    async function toggleFavoriteArtist(artist, anchorEl = null) {
        const result = await controller.toggleStyleFavorite(artist, anchorEl, { rerenderFavorites: renderFavorites });
        if (!result?.ok) return result;

        syncCardFavoriteState(String(artist?.tag || ""), result.favorited);

        if (store.category === "all" && store.artistFilters?.favoritesOnly) {
            await render();
        }
        return result;
    }

    async function applyHighlighted() {
        const artist = ensureHighlightedArtist({ scroll: true });
        if (!artist) return false;
        await applyArtist(artist, getCardAnchorByTag(artist.tag));
        return true;
    }

    async function copyHighlightedTag() {
        const artist = ensureHighlightedArtist({ scroll: true });
        if (!artist) return false;
        const result = await copyArtistTag(artist, getCardAnchorByTag(artist.tag));
        return !!result?.ok;
    }

    async function toggleFavoriteHighlighted() {
        const artist = ensureHighlightedArtist({ scroll: true });
        if (!artist) return false;
        const result = await toggleFavoriteArtist(artist, getCardAnchorByTag(artist.tag));
        return !!result?.ok;
    }

    async function openSwipe(startIndex) {
        if (!store.lastList.length) await render();
        if (!store.lastList.length) return;

        const boundedStart = Math.max(0, Math.min(Number(startIndex) || 0, store.lastList.length - 1));
        swipe.open({
            list: store.lastList,
            startIndex: boundedStart,
            onApply: (artist, anchorEl = null) => applyArtist(artist, anchorEl),
            onToggleFavorite: (selectedArtist, anchorEl = null) => toggleFavoriteArtist(selectedArtist, anchorEl),
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

        store.lastList = list;
        ensureHighlightedArtist();
        store.countEl.textContent = `${list.length} favorites`;
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
        requestAnimationFrame(() => {
            ensureHighlightedArtist();
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
        store.lastList = list;
        ensureHighlightedArtist();
        store.countEl.textContent = `${list.length} styles`;
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
        requestAnimationFrame(() => {
            ensureHighlightedArtist();
        });
    }

    function card(artist) {
        return createStyleCard({
            artist,
            imageUrl: thumbUrl(artist, false),
            isUniq: store.sort === "uniqueness",
            isFav: controller.isFavorited(artist),
            isSelected: String(store.lastHighlightedTag || "") === String(artist?.tag || ""),
            onApply: (selectedArtist, anchorEl = null) => applyArtist(selectedArtist, anchorEl),
            onCopy: (selectedArtist, anchorEl = null) => copyArtistTag(selectedArtist, anchorEl),
            onHighlight: (selectedArtist) => highlight(selectedArtist?.tag || ""),
            onToggleFavorite: (selectedArtist, _btn, anchorEl = null) => toggleFavoriteArtist(selectedArtist, anchorEl),
            onOpenSwipe: (selectedArtist) => {
                const idx = store.lastList.findIndex((item) => item.tag === selectedArtist.tag);
                openSwipe(idx >= 0 ? idx : 0);
            },
        });
    }

    return {
        setCategoryTabs,
        refreshSlotSummary,
        setActiveSlot,
        openSwipe,
        renderFavorites,
        render,
        highlight,
        moveHighlight,
        applyHighlighted,
        copyHighlightedTag,
        toggleFavoriteHighlighted,
        refreshFilterSummary,
    };
}

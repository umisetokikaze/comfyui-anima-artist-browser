import { extractFavoriteItems, hasFavoritePayloadShape } from "./browser_favorites.js";
import { logWarn } from "./logger.js";

export function attachBrowserEvents({
    el,
    api,
    localHeaders,
    ensureLocalToken,
    getCategory,
    getLocalFavoritesCount,
    reloadLocalFavorites,
    exportFavoritesPayload,
    importFavorites,
    clearFavorites,
    render,
    close,
    dataReset,
    getFilters,
    setFilters,
    setSort,
    setCategory,
    setCategoryTabs,
    setObserver,
    setActiveSlot,
    refreshSlotSummary,
    refreshFilterSummary,
    moveHighlight,
    applyHighlighted,
    copyHighlightedTag,
    toggleFavoriteHighlighted,
    openSwipeFromHighlighted,
    loadLocalFavorites,
}) {
    const onlineToggle = el.querySelector("#anima-online-toggle");
    if (localStorage.getItem("anima_online") === null) {
        localStorage.setItem("anima_online", "true");
    }
    onlineToggle.checked = localStorage.getItem("anima_online") === "true";
    onlineToggle.addEventListener("change", (e) => {
        localStorage.setItem("anima_online", e.target.checked);
        render();
    });

    const ensureHeadersReady = async () => {
        const ok = await ensureLocalToken();
        if (!ok) {
            throw new Error("Local security token not available. Reopen the browser and try again.");
        }
        return localHeaders();
    };

    function reportActionFailure(context, error, userMessage = "") {
        logWarn(context, error);
        if (userMessage) {
            alert(userMessage);
        }
    }

    function restoreInlineButton(button, html) {
        button.innerHTML = html;
        button.style.pointerEvents = "auto";
    }

    function setInlineBusy(button, label) {
        if (!button) return "";
        const oldHtml = button.innerHTML;
        button.textContent = label;
        button.style.pointerEvents = "none";
        return oldHtml;
    }

    function safeFileStamp() {
        return new Date().toISOString().replace(/[:.]/g, "-");
    }

    function downloadJsonFile(filename, payload) {
        const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.download = filename;
        document.body.appendChild(link);
        link.click();
        link.remove();
        setTimeout(() => URL.revokeObjectURL(url), 0);
    }

    const closeBrowser = () => {
        close();
    };

    const dlBtn = el.querySelector("#anima-dl-images");

    function resetDownloadButton(delay = 0) {
        const applyReset = () => {
            dlBtn.textContent = "Download Previews";
            dlBtn.classList.remove("disabled");
        };

        if (delay > 0) {
            setTimeout(applyReset, delay);
            return;
        }

        applyReset();
    }

    async function pollDownloadStatus() {
        try {
            dlBtn.classList.add("disabled");
            const statusResponse = await api.fetchApi("/anima/download_status");
            const status = await statusResponse.json();
            if (status.active) {
                dlBtn.textContent = `Downloading ${status.done}/${status.total}...`;
                setTimeout(() => {
                    void pollDownloadStatus();
                }, 1000);
                return;
            }

            dlBtn.textContent = "Download Complete!";
            dlBtn.classList.remove("disabled");
            resetDownloadButton(3000);
            await render();
        } catch (error) {
            resetDownloadButton();
            reportActionFailure("Failed while polling preview download status", error, "Could not refresh preview download status.");
        }
    }

    dlBtn.addEventListener("click", async () => {
        if (dlBtn.classList.contains("disabled")) return;
        const ok = confirm(
            "This will download preview images for up to 20,000 styles.\n\n"
            + "It can take a long time and may use hundreds of MB.\n\n"
            + "Continue?"
        );
        if (!ok) return;

        try {
            const headers = await ensureHeadersReady();
            const response = await api.fetchApi("/anima/download_images", { method: "POST", headers });
            const payload = await response.json().catch(() => ({}));
            if (!payload.success) {
                alert("Download already in progress or failed to start.");
                return;
            }
            void pollDownloadStatus();
        } catch (err) {
            reportActionFailure("Failed to start preview download", err, err?.message || "Could not start preview download.");
        }
    });

    const isBrowserOpen = () => !!el && !el.classList.contains("hidden");
    const isSwipeOpen = () => {
        const swipeEl = document.getElementById("anima-swipe");
        return !!swipeEl && !swipeEl.classList.contains("hidden");
    };
    const isTextEditingTarget = (target) => {
        if (!(target instanceof Element)) return false;
        if (target.closest?.('[contenteditable="true"]')) return true;
        const editable = target.closest?.("textarea, input");
        if (!(editable instanceof HTMLInputElement || editable instanceof HTMLTextAreaElement)) return false;
        if (editable instanceof HTMLTextAreaElement) return true;
        return !["button", "checkbox", "color", "file", "hidden", "image", "radio", "range", "reset", "submit"].includes(editable.type);
    };
    const isInteractiveTarget = (target) => {
        if (!(target instanceof Element)) return false;
        return !!target.closest?.("button, select, a, textarea, input, [contenteditable='true']");
    };

    el.querySelector(".backdrop").addEventListener("click", closeBrowser);
    el.querySelector(".hdr-close").addEventListener("click", closeBrowser);

    el.querySelector("#anima-refresh").addEventListener("click", async (e) => {
        const btn = e.currentTarget;
        const oldHtml = btn.innerHTML;
        btn.innerHTML = `<div class="anima-spinner" style="width:14px;height:14px;border-width:2px"></div>`;
        btn.style.pointerEvents = "none";
        try {
            if (getCategory() === "favorites") {
                await reloadLocalFavorites();
            } else {
                dataReset();
            }
            await render();
        } catch (error) {
            reportActionFailure("Failed to refresh browser view", error);
        }
        restoreInlineButton(btn, oldHtml);
    });

    let filterRenderTo;

    function updateFilters(partial = {}, { debounceMs = 0 } = {}) {
        const current = typeof getFilters === "function" ? getFilters() : {};
        setFilters({
            ...current,
            ...partial,
        });
        refreshFilterSummary?.();
        clearTimeout(filterRenderTo);
        if (debounceMs > 0) {
            filterRenderTo = setTimeout(() => {
                void render();
            }, debounceMs);
            return;
        }
        void render();
    }

    const searchInput = el.querySelector(".cycle-search input");
    const worksMinInput = el.querySelector("#anima-filter-works-min");
    const worksMaxInput = el.querySelector("#anima-filter-works-max");
    const uniqMinInput = el.querySelector("#anima-filter-uniq-min");
    const uniqMaxInput = el.querySelector("#anima-filter-uniq-max");
    const favoritesOnlyInput = el.querySelector("#anima-filter-favorites-only");
    const clearFiltersBtn = el.querySelector("#anima-filter-clear");
    const exportFavoritesBtn = el.querySelector("#anima-export-favorites");
    const importFavoritesBtn = el.querySelector("#anima-import-favorites");
    const clearFavoritesBtn = el.querySelector("#anima-clear-favorites");
    const importFavoritesFileInput = el.querySelector("#anima-favorites-import-file");
    const initialFilters = typeof getFilters === "function" ? getFilters() : {};

    if (searchInput) searchInput.value = initialFilters.query || "";
    if (worksMinInput) worksMinInput.value = initialFilters.worksMin || "";
    if (worksMaxInput) worksMaxInput.value = initialFilters.worksMax || "";
    if (uniqMinInput) uniqMinInput.value = initialFilters.uniquenessMin || "";
    if (uniqMaxInput) uniqMaxInput.value = initialFilters.uniquenessMax || "";
    if (favoritesOnlyInput) favoritesOnlyInput.checked = !!initialFilters.favoritesOnly;

    searchInput?.addEventListener("input", (e) => {
        updateFilters({ query: e.target.value.replace(/^@/, "") }, { debounceMs: 150 });
    });

    const bindNumberFilter = (inputEl, key) => {
        inputEl?.addEventListener("input", (e) => {
            updateFilters({ [key]: e.target.value }, { debounceMs: 150 });
        });
    };

    bindNumberFilter(worksMinInput, "worksMin");
    bindNumberFilter(worksMaxInput, "worksMax");
    bindNumberFilter(uniqMinInput, "uniquenessMin");
    bindNumberFilter(uniqMaxInput, "uniquenessMax");

    favoritesOnlyInput?.addEventListener("change", (e) => {
        updateFilters({ favoritesOnly: !!e.target.checked });
    });

    clearFiltersBtn?.addEventListener("click", () => {
        const cleared = {
            query: "",
            worksMin: "",
            worksMax: "",
            uniquenessMin: "",
            uniquenessMax: "",
            favoritesOnly: false,
        };
        setFilters(cleared);
        if (searchInput) searchInput.value = "";
        if (worksMinInput) worksMinInput.value = "";
        if (worksMaxInput) worksMaxInput.value = "";
        if (uniqMinInput) uniqMinInput.value = "";
        if (uniqMaxInput) uniqMaxInput.value = "";
        if (favoritesOnlyInput) favoritesOnlyInput.checked = false;
        refreshFilterSummary?.();
        void render();
    });

    exportFavoritesBtn?.addEventListener("click", async () => {
        const oldHtml = setInlineBusy(exportFavoritesBtn, "Exporting...");
        try {
            const payload = await exportFavoritesPayload?.();
            if (!payload || !Array.isArray(payload.items)) {
                throw new Error("Favorite export payload unavailable.");
            }
            downloadJsonFile(`anima-favorites-${safeFileStamp()}.json`, payload);
        } catch (error) {
            reportActionFailure("Failed to export favorites", error, "Could not export favorites.");
        } finally {
            restoreInlineButton(exportFavoritesBtn, oldHtml || "Export Favorites");
        }
    });

    importFavoritesBtn?.addEventListener("click", () => {
        if (!importFavoritesFileInput) return;
        importFavoritesFileInput.value = "";
        importFavoritesFileInput.click();
    });

    importFavoritesFileInput?.addEventListener("change", async (event) => {
        const file = event.target?.files?.[0];
        if (!file) return;

        const oldHtml = setInlineBusy(importFavoritesBtn, "Importing...");
        try {
            const text = await file.text();
            const payload = JSON.parse(text);
            if (!hasFavoritePayloadShape(payload)) {
                throw new Error("Favorites JSON must be an array or contain an items/favorites array.");
            }

            const items = extractFavoriteItems(payload);
            const existingFavoritesCount = Number(getLocalFavoritesCount?.()) || 0;
            let replaceExisting = false;

            if (existingFavoritesCount > 0) {
                if (items.length === 0) {
                    replaceExisting = confirm("Imported file is empty.\n\nOK = replace current favorites with an empty list\nCancel = keep current favorites.");
                    if (!replaceExisting) {
                        return;
                    }
                } else {
                    replaceExisting = confirm(
                        "Replace current favorites with the imported file?\n\nOK = replace current favorites\nCancel = merge imported favorites into current favorites."
                    );
                }
            }

            const result = await importFavorites?.(items, { replace: replaceExisting });
            if (result?.ok) {
                await render();
            }
        } catch (error) {
            reportActionFailure("Failed to import favorites", error, error?.message || "Could not import favorites.");
        } finally {
            if (importFavoritesFileInput) importFavoritesFileInput.value = "";
            restoreInlineButton(importFavoritesBtn, oldHtml || "Import Favorites");
        }
    });

    clearFavoritesBtn?.addEventListener("click", async () => {
        const ok = confirm("Clear all local favorites?\n\nThis cannot be undone unless you exported them first.");
        if (!ok) return;

        const oldHtml = setInlineBusy(clearFavoritesBtn, "Clearing...");
        try {
            const result = await clearFavorites?.();
            if (result?.ok) {
                await render();
            }
        } catch (error) {
            reportActionFailure("Failed to clear favorites", error, "Could not clear favorites.");
        } finally {
            restoreInlineButton(clearFavoritesBtn, oldHtml || "Clear Favorites");
        }
    });

    document.addEventListener("keydown", (e) => {
        if (!isBrowserOpen() || isSwipeOpen()) return;

        if (e.key === "Escape") {
            e.preventDefault();
            closeBrowser();
            return;
        }

        const editing = isTextEditingTarget(e.target);
        const interactive = isInteractiveTarget(e.target);

        if (!editing && (
            (e.key === "/" && !e.ctrlKey && !e.metaKey && !e.altKey)
            || ((e.ctrlKey || e.metaKey) && String(e.key || "").toLowerCase() === "f")
        )) {
            e.preventDefault();
            searchInput?.focus();
            searchInput?.select?.();
            return;
        }

        if (interactive) return;

        const digitMatch = String(e.code || "").match(/^Digit([1-9])$/);
        if (digitMatch && !e.ctrlKey && !e.metaKey && !e.altKey && !e.shiftKey) {
            e.preventDefault();
            const slotIndex = Number(digitMatch[1]) - 1;
            setActiveSlot(slotIndex);
            refreshSlotSummary();
            return;
        }

        switch (e.code) {
            case "ArrowLeft":
                e.preventDefault();
                moveHighlight?.(-1);
                return;
            case "ArrowRight":
                e.preventDefault();
                moveHighlight?.(1);
                return;
            case "ArrowUp":
                e.preventDefault();
                moveHighlight?.(-1, { vertical: true });
                return;
            case "ArrowDown":
                e.preventDefault();
                moveHighlight?.(1, { vertical: true });
                return;
            case "Enter":
                e.preventDefault();
                void applyHighlighted?.();
                return;
            case "KeyC":
                e.preventDefault();
                void copyHighlightedTag?.();
                return;
            case "KeyF":
                e.preventDefault();
                void toggleFavoriteHighlighted?.();
                return;
            case "KeyS":
                e.preventDefault();
                void openSwipeFromHighlighted?.();
                return;
            default:
                return;
        }
    });

    const updateBtn = el.querySelector("#anima-update-styles");
    updateBtn.addEventListener("click", async () => {
        if (updateBtn.classList.contains("disabled")) return;
        updateBtn.innerHTML = "Updating...";
        updateBtn.classList.add("disabled");
        try {
            const headers = await ensureHeadersReady();
            const response = await api.fetchApi("/anima/update", { method: "POST", headers });
            const payload = await response.json().catch(() => ({}));
            if (payload.success) {
                dataReset();
                await render();
                updateBtn.innerHTML = "Success!";
            } else {
                updateBtn.innerHTML = "Failed!";
            }
        } catch (err) {
            updateBtn.innerHTML = "Error!";
            reportActionFailure("Failed to update styles", err, err?.message || "Could not update styles.");
        }
        setTimeout(() => {
            updateBtn.innerHTML = "Update Styles";
            updateBtn.classList.remove("disabled");
        }, 2000);
    });

    el.querySelector(".hdr-select").addEventListener("change", (e) => {
        setSort(e.target.value);
        render();
    });

    el.querySelector("#anima-swipe-btn")?.addEventListener("click", async () => {
        await openSwipeFromHighlighted();
    });

    el.querySelector("#anima-cat-all").addEventListener("click", async () => {
        setCategory("all");
        setCategoryTabs();
        await render();
    });

    el.querySelector("#anima-cat-favorites").addEventListener("click", async () => {
        setCategory("favorites");
        setCategoryTabs();
        await render();
    });

    el.querySelector("#anima-slot-list")?.addEventListener("click", (event) => {
        const button = event.target?.closest?.(".slot-chip");
        if (!button) return;
        const slotIndex = Number(button.dataset.slotIndex);
        if (!Number.isInteger(slotIndex)) return;
        setActiveSlot(slotIndex);
        refreshSlotSummary();
    });

    const observer = new IntersectionObserver((entries) => {
        entries.forEach((entry) => {
            if (entry.isIntersecting) entry.target._mount?.();
            else entry.target._unmount?.();
        });
    }, { root: el.querySelector(".body"), rootMargin: "400px" });
    setObserver(observer);

    setCategoryTabs();
    refreshSlotSummary();
    refreshFilterSummary?.();
    (async () => {
        await loadLocalFavorites();
    })();
}

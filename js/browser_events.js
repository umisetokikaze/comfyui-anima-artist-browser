import { logWarn } from "./logger.js";

export function attachBrowserEvents({
    el,
    api,
    localHeaders,
    ensureLocalToken,
    getCategory,
    reloadLocalFavorites,
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

    el.querySelector(".backdrop").addEventListener("click", closeBrowser);
    el.querySelector(".hdr-close").addEventListener("click", closeBrowser);
    document.addEventListener("keydown", (e) => {
        if (e.key === "Escape") {
            closeBrowser();
        }
    });

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

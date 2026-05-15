import { logWarn } from "./logger.js";

export function createBrowserController({
    api,
    store,
    fetchLocalFavorites,
    sendLocalFavoriteMutation,
    rebuildFavoriteMap,
    buildFavoriteExportPayload,
    localFavoriteFromStyle,
    showToast,
}) {
    function localHeaders() {
        if (!store.localApiToken) return {};
        return { "x-anima-local-token": store.localApiToken };
    }

    async function fetchLocalApiToken() {
        if (store.localApiToken) return store.localApiToken;
        try {
            const response = await api.fetchApi("/anima/local_token");
            const payload = await response.json().catch(() => ({}));
            if (typeof payload.localToken === "string" && payload.localToken) {
                store.localApiToken = payload.localToken;
            }
        } catch (error) {
            logWarn("Failed to fetch local API token", error);
        }
        return store.localApiToken;
    }

    async function ensureLocalToken() {
        if (store.localApiToken) return true;
        await fetchLocalApiToken();
        return !!store.localApiToken;
    }

    function rebuildFavoriteState() {
        store.favoriteMap = rebuildFavoriteMap(store.localFavorites, []);
        return store.favoriteMap;
    }

    async function loadLocalFavorites(force = false) {
        if (store.localFavoritesLoaded && !force) return store.localFavorites;
        store.localFavorites = await fetchLocalFavorites(api);
        store.localFavoritesLoaded = true;
        rebuildFavoriteState();
        return store.localFavorites;
    }

    async function reloadLocalFavorites() {
        store.localFavoritesLoaded = false;
        return await loadLocalFavorites(true);
    }

    async function mutateLocalFavorites(payload) {
        await ensureLocalToken();

        const result = await sendLocalFavoriteMutation(api, localHeaders(), payload);
        if (!result.ok) {
            if (!store.localApiToken && result.status === 403) {
                return { ok: false, error: result.error || "Favorite update is blocked for this browser origin." };
            }
            return { ok: false, error: result.error || "Favorite update failed" };
        }

        store.localFavorites = Array.isArray(result.items) ? result.items : store.localFavorites;
        store.localFavoritesLoaded = true;
        rebuildFavoriteState();
        return { ok: true, data: result.data };
    }

    function isFavorited(artist) {
        const entry = localFavoriteFromStyle(artist);
        return !!entry?.key && store.favoriteMap.has(entry.key);
    }

    async function toggleStyleFavorite(artist, anchorEl = null, { rerenderFavorites } = {}) {
        const entry = localFavoriteFromStyle(artist);
        if (!entry) {
            alert("Invalid style favorite payload.");
            return { ok: false };
        }

        const already = store.favoriteMap.has(entry.key);
        const result = already
            ? await mutateLocalFavorites({ action: "remove", key: entry.key })
            : await mutateLocalFavorites({ action: "upsert", item: entry });

        if (!result.ok) {
            alert(result.error || "Could not update favorite.");
            return { ok: false };
        }

        const favorited = !already;
        showToast(favorited ? "Added to favorites" : "Removed from favorites", "success", 1500, { anchor: anchorEl });

        if (store.category === "favorites" && typeof rerenderFavorites === "function") {
            await rerenderFavorites();
        }
        return { ok: true, favorited };
    }

    async function exportFavoritesPayload() {
        await loadLocalFavorites();
        return buildFavoriteExportPayload(store.localFavorites);
    }

    async function importFavorites(items = [], { replace = false } = {}) {
        if (!Array.isArray(items)) {
            return { ok: false, error: "Invalid favorites import payload." };
        }

        const result = await mutateLocalFavorites({
            action: "import",
            mode: replace ? "replace" : "merge",
            items,
        });
        if (!result.ok) {
            alert(result.error || "Could not import favorites.");
            return { ok: false, error: result.error || "Could not import favorites." };
        }

        const importedCount = Number(result.data?.imported) || 0;
        const modeLabel = replace ? "Replaced" : "Imported";
        showToast(`${modeLabel} ${importedCount} favorites`, "success", 1800);
        return {
            ok: true,
            imported: importedCount,
            replace: !!replace,
            total: store.localFavorites.length,
        };
    }

    async function clearFavorites() {
        const result = await mutateLocalFavorites({ action: "clear" });
        if (!result.ok) {
            alert(result.error || "Could not clear favorites.");
            return { ok: false, error: result.error || "Could not clear favorites." };
        }

        const clearedCount = Number(result.data?.cleared) || 0;
        showToast(clearedCount ? `Cleared ${clearedCount} favorites` : "Favorites already empty", "success", 1600);
        return {
            ok: true,
            cleared: clearedCount,
            total: store.localFavorites.length,
        };
    }

    return {
        localHeaders,
        ensureLocalToken,
        loadLocalFavorites,
        reloadLocalFavorites,
        mutateLocalFavorites,
        isFavorited,
        toggleStyleFavorite,
        exportFavoritesPayload,
        importFavorites,
        clearFavorites,
    };
}

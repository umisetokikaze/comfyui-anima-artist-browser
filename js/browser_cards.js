import { escapeHtml } from "./browser_helpers.js";

export function createStyleCard({
    artist,
    imageUrl,
    isUniq = false,
    isFav = false,
    isSelected = false,
    onApply,
    onCopy,
    onHighlight,
    onToggleFavorite,
    onOpenSwipe,
}) {
    const card = document.createElement("div");
    card.className = `anima-card${isSelected ? " selected" : ""}`;
    card.dataset.tag = artist.tag;
    card.tabIndex = 0;
    card.setAttribute("role", "button");
    card.setAttribute("aria-label", `Artist @${String(artist.tag || "").replace(/_/g, " ")}`);

    const rankHtml = isUniq && artist.uniquenessRank
        ? `<div class="anima-uniqueness-rank" title="Uniqueness score: ${Number(artist.uniqueness_score || 0).toFixed(2)}">#${artist.uniquenessRank}</div>`
        : "";

    card.innerHTML = `
        <div class="anima-card-img" data-init="${escapeHtml((artist.tag?.[0] || "?").toUpperCase())}">
            <img loading="lazy" src="${escapeHtml(imageUrl)}" alt="${escapeHtml(artist.tag || "")}" onerror="this.style.display='none';this.parentElement.classList.add('no-img')"/>
            ${rankHtml}
            <div class="anima-card-favorite-badge${isFav ? " active" : ""}" title="Favorited">&#10084;</div>
            <div class="anima-card-overlay">
                <div class="anima-card-actions">
                    <button class="anima-card-pick" title="Apply to active slot (Enter)">Apply</button>
                    <button class="anima-card-copy" title="Copy artist tag (C)">Copy</button>
                </div>
                <button class="anima-card-fav" title="Toggle favorite (F)">${isFav ? "Unfavorite" : "Favorite"}</button>
            </div>
        </div>
        <div class="anima-card-meta">
            <span class="anima-card-tag" title="@${escapeHtml(String(artist.tag || "").replace(/_/g, " "))}">@${escapeHtml(String(artist.tag || "").replace(/_/g, " "))}</span>
            ${(!isUniq && artist.works) ? `<span class="anima-card-works">${Number(artist.works).toLocaleString()} works</span>` : ""}
        </div>
    `;

    const mediaEl = card.querySelector(".anima-card-img");

    card.addEventListener("mouseenter", () => {
        onHighlight?.(artist);
    });

    card.addEventListener("mouseenter", () => {
        const img = card.querySelector("img");
        if (img && (!img.complete || img.naturalWidth === 0)) {
            img.src = imageUrl + (imageUrl.includes("?") ? "&" : "?") + "t=" + Date.now();
        }
    }, { once: true });

    card.addEventListener("focusin", () => {
        onHighlight?.(artist);
    });

    card.addEventListener("mousedown", (e) => {
        if (e.button !== 1) return;
        e.preventDefault();
        e.stopPropagation();
        onOpenSwipe?.(artist);
    });

    const pick = () => onApply?.(artist, mediaEl || card);
    card.querySelector(".anima-card-pick").addEventListener("click", (e) => {
        e.stopPropagation();
        pick();
    });

    card.querySelector(".anima-card-copy").addEventListener("click", async (e) => {
        e.stopPropagation();
        await onCopy?.(artist, mediaEl || card);
    });

    const favBtn = card.querySelector(".anima-card-fav");
    const favBadge = card.querySelector(".anima-card-favorite-badge");
    favBtn.addEventListener("click", async (e) => {
        e.stopPropagation();
        const res = await onToggleFavorite?.(artist, favBtn, mediaEl || favBtn);
        if (res?.ok && typeof res.favorited === "boolean") {
            favBtn.textContent = res.favorited ? "Unfavorite" : "Favorite";
            favBadge?.classList.toggle("active", res.favorited);
        }
    });

    card.addEventListener("click", pick);
    return card;
}

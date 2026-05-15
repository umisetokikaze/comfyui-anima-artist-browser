export function getBrowserTemplate(siteBase) {
    return `
            <div class="backdrop"></div>
            <div class="window">
                <div class="hdr">
                    <span class="hdr-title" style="margin-right:4px">Anima Artist Browser</span>
                    <button class="hdr-btn-txt" id="anima-cat-all" style="margin-left:8px; opacity:1;">All Styles</button>
                    <button class="hdr-btn-txt" id="anima-cat-favorites" style="opacity:0.5;">Favorites</button>
                    <select class="hdr-select" style="margin-left:8px">
                        <option value="works">Popularity</option>
                        <option value="uniqueness">Uniqueness</option>
                        <option value="name">A - Z</option>
                    </select>
                    <div class="hdr-gap"></div>
                    <div class="hdr-data-btns">
                        <div class="hdr-toggle-wrap" title="Show remote preview images from the internet">
                            <span class="hdr-toggle-label">Remote Images</span>
                            <label class="hdr-switch">
                                <input type="checkbox" id="anima-online-toggle"/>
                                <span class="hdr-slider"></span>
                            </label>
                        </div>
                        <div class="hdr-settings-wrap" title="Tools">
                            <button class="hdr-btn" id="anima-settings-gear" aria-label="Tools">&#9881;</button>
                            <div class="hdr-settings-menu">
                                <button class="hdr-btn-txt hdr-settings-item" id="anima-update-styles">Update Styles</button>
                                <button class="hdr-btn-txt hdr-settings-item" id="anima-dl-images">Download Previews</button>
                            </div>
                        </div>
                        <button class="hdr-btn" id="anima-refresh" title="Refresh View">&#8635;</button>
                    </div>
                    <button class="hdr-close" title="Close" style="margin-left:8px">&#10005;</button>
                </div>
                <div class="cycle-bar">
                    <span class="cycle-label">Queue Mode</span>
                    <button class="anima-play-btn" id="anima-cycle-btn">
                        <span class="btn-icon">&#9654;</span>
                        <span class="btn-lbl">Play</span>
                    </button>
                    <span class="anima-cycle-status" id="anima-cycle-status">stopped</span>
                    <button class="anima-swipe-btn" id="anima-swipe-btn" title="Swipe through styles one by one">Swipe Mode</button>
                    <div class="cycle-search">
                        <i>@</i>
                        <input type="text" placeholder="Search artists..." autocomplete="off" spellcheck="false"/>
                    </div>
                    <div class="cycle-gap"></div>
                    <span class="cycle-hint">Play uses the node's After Queue and Auto Queue settings for the active slot</span>
                </div>
                <div class="filter-bar">
                    <div class="filter-copy">
                        <span class="filter-copy-label">Filters</span>
                        <span class="filter-copy-summary" id="anima-filter-summary">Multi-word search plus works, uniqueness, and favorites filters</span>
                    </div>
                    <label class="filter-field">
                        <span>Works Min</span>
                        <input type="number" id="anima-filter-works-min" min="0" step="1" placeholder="0"/>
                    </label>
                    <label class="filter-field">
                        <span>Works Max</span>
                        <input type="number" id="anima-filter-works-max" min="0" step="1" placeholder="any"/>
                    </label>
                    <label class="filter-field">
                        <span>Uniq Min</span>
                        <input type="number" id="anima-filter-uniq-min" min="0" step="0.01" placeholder="0.00"/>
                    </label>
                    <label class="filter-field">
                        <span>Uniq Max</span>
                        <input type="number" id="anima-filter-uniq-max" min="0" step="0.01" placeholder="any"/>
                    </label>
                    <label class="filter-check">
                        <input type="checkbox" id="anima-filter-favorites-only"/>
                        <span>Favorited Only</span>
                    </label>
                    <button class="filter-clear-btn" id="anima-filter-clear" type="button">Clear</button>
                </div>
                <div class="slot-bar" id="anima-slot-bar">
                    <div class="slot-bar-copy">
                        <span class="slot-bar-label">Target Slots</span>
                        <span class="slot-bar-hint" id="anima-slot-hint">Open from a node to target slots directly</span>
                    </div>
                    <div class="slot-bar-slots" id="anima-slot-list"></div>
                </div>
                <div class="body">
                    <div class="anima-grid" id="anima-grid">
                        <div class="anima-empty"><div class="anima-spinner"></div><span>Loading styles...</span></div>
                    </div>
                </div>
                <div class="ftr">
                    <span class="ftr-count" id="anima-count"></span>
                    <span class="ftr-count"> | </span>
                    <span class="ftr-count">Local style browser workflow</span>
                    <span class="ftr-count ftr-shortcuts">Shortcuts: / search · arrows move · Enter apply · C copy · F favorite · S swipe · 1-9 slot</span>
                    <div class="ftr-gap"></div>
                    <a class="ftr-link" href="${siteBase}" target="_blank" rel="noopener">thetacursed.github.io/Anima-Style-Explorer -&gt;</a>
                </div>
            </div>
    `;
}

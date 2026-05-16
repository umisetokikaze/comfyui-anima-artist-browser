# Findings

- `Apply` routes through `browser_cards.js` -> `browser_view.js` -> `AutoCycle.inject()` -> `applyStyle()` -> `writeArtistSlot()`.
- V3 `Autogrow` slots are input-first and may not expose a writable widget.
- The existing fallback creates `LiteGraph.createNode("PrimitiveString")`, but current ComfyUI frontend creates and registers `PrimitiveNode` for widget-input primitives.
- Because the primitive node type can be missing, `writeArtistSlot()` can fail before any artist token is written to the node.
- A direct `globalThis.LiteGraph.createNode(...)` call can still miss the frontend instance that ComfyUI core uses internally.
- ComfyUI core already attaches primitive nodes through `node.onInputDblClick(slot)`, so using that hook is the safer first path.

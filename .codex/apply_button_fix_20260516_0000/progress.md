# Progress

- Checked `comfyui-custom-nodes` routing and loaded frontend/advanced references.
- Read the node schema and frontend modules involved in browser apply.
- Confirmed current ComfyUI frontend source uses `PrimitiveNode` for automatic primitive attachment.
- Patched `js/utils.js` to create `PrimitiveNode` first and keep `PrimitiveString` fallbacks.
- Hardened primitive connection result handling so link IDs such as `0` are accepted in both connect and post-connect checks.
- Follow-up: `Could not create artist slot` still appeared in ComfyUI.
- Patched `ensureArtistPrimitive()` to try ComfyUI's native `onInputDblClick(slot)` primitive attachment hook before direct node creation.
- Relaxed the direct `globalThis.LiteGraph.createNode` dependency when the native hook is available.
- JS syntax check passed for all files under `js/`.
- Python `py_compile` passed for the custom node backend files.
- `git diff --check` passed, with only Git's LF-to-CRLF working-tree warning.

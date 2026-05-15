from aiohttp import web

from .services.favorites_service import (
    clear_local_favorites,
    favorite_key_for_item,
    has_local_favorite,
    import_local_favorites,
    list_local_favorites,
    remove_local_favorite,
    upsert_local_favorite,
)


def register_favorite_routes(server, require_local_token, is_same_origin_request=None):
    @server.instance.routes.get("/anima/favorites")
    async def get_favorites(request):
        return web.json_response({"items": list_local_favorites()})

    @server.instance.routes.post("/anima/favorites")
    async def mutate_favorites(request):
        denied = require_local_token(request)
        allow_same_origin = callable(is_same_origin_request) and is_same_origin_request(request)
        if denied is not None and not allow_same_origin:
            return denied

        try:
            body = await request.json()
        except Exception:
            body = {}

        if not isinstance(body, dict):
            body = {}

        action = str(body.get("action") or "upsert").strip().lower()
        item = body.get("item") if isinstance(body.get("item"), dict) else {}
        items = body.get("items") if isinstance(body.get("items"), list) else []

        if action == "clear":
            cleared = len(list_local_favorites())
            clear_local_favorites()
            return web.json_response({"ok": True, "cleared": cleared, "items": []})

        if action == "import":
            mode = str(body.get("mode") or "merge").strip().lower()
            _, imported_count = import_local_favorites(items, mode=mode)
            return web.json_response({
                "ok": True,
                "imported": imported_count,
                "mode": "replace" if mode == "replace" else "merge",
                "items": list_local_favorites(),
            })

        if action == "remove":
            changed = remove_local_favorite(key=str(body.get("key") or ""), item=item)
            return web.json_response({"ok": True, "removed": changed, "items": list_local_favorites()})

        if action == "toggle":
            key = favorite_key_for_item(item)
            if not key:
                return web.json_response({"error": "Invalid favorite payload"}, status=400)

            if has_local_favorite(key):
                remove_local_favorite(key=key)
                return web.json_response({"ok": True, "favorited": False, "items": list_local_favorites()})

            entry = upsert_local_favorite(item)
            if not entry:
                return web.json_response({"error": "Invalid favorite payload"}, status=400)
            return web.json_response({"ok": True, "favorited": True, "item": entry, "items": list_local_favorites()})

        entry = upsert_local_favorite(item)
        if not entry:
            return web.json_response({"error": "Invalid favorite payload"}, status=400)

        return web.json_response({"ok": True, "item": entry, "items": list_local_favorites()})

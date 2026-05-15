try:
    from server import PromptServer
    from . import routes
    routes.register(PromptServer)
    print(" [AnimaArtistBrowser] Routes registered successfully.")
except Exception as e:
    print(f" [AnimaArtistBrowser] Error registering routes: {e}")

WEB_DIRECTORY = "./js"

from .nodes import comfy_entrypoint

__all__ = ["WEB_DIRECTORY", "comfy_entrypoint"]

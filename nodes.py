MAX_ARTIST_SLOTS = 3
DEFAULT_ARTIST_STRENGTH = 1.0


def artist_input():
    return ("STRING", {
        "multiline": False,
        "dynamicPrompts": True,
        "default": "",
    })


def strength_input():
    return ("FLOAT", {
        "default": DEFAULT_ARTIST_STRENGTH,
        "min": 0.0,
        "max": 3.0,
        "step": 0.05,
    })


class AnimaArtistBrowser:
    RETURN_TYPES = ("STRING",)
    RETURN_NAMES = ("artist_string",)
    OUTPUT_TOOLTIPS = ("Combined artist tags from all selected slots, with optional per-slot strength.",)
    FUNCTION = "build_artist_string"

    CATEGORY = "Anima"
    DESCRIPTION = "Builds a single artist tag string by combining up to three selected artist tags with optional per-slot strength."
    SEARCH_ALIASES = ["artist browser", "artist tags", "anime artist", "artist string", "multi artist", "artist weight", "artist strength"]

    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "artist_1": artist_input(),
                "strength_1": strength_input(),
                "artist_2": artist_input(),
                "strength_2": strength_input(),
                "artist_3": artist_input(),
                "strength_3": strength_input(),
            },
        }

    @staticmethod
    def _normalize_artist(value):
        display = str(value or "").strip().lstrip("@").replace("_", " ")
        display = " ".join(display.split())
        return f"@{display}" if display else ""

    @staticmethod
    def _normalize_strength(value):
        try:
            strength = float(value)
        except Exception:
            strength = DEFAULT_ARTIST_STRENGTH
        return max(0.0, strength)

    @staticmethod
    def _format_strength(value):
        return f"{value:.2f}".rstrip("0").rstrip(".") or "0"

    @classmethod
    def _format_artist_token(cls, artist, strength):
        if not artist:
            return ""
        normalized_strength = cls._normalize_strength(strength)
        if abs(normalized_strength - DEFAULT_ARTIST_STRENGTH) < 1e-9:
            return artist
        return f"({artist}:{cls._format_strength(normalized_strength)})"

    def build_artist_string(self, artist_1, strength_1, artist_2, strength_2, artist_3, strength_3):
        artists = [artist_1, artist_2, artist_3][:MAX_ARTIST_SLOTS]
        strengths = [strength_1, strength_2, strength_3][:MAX_ARTIST_SLOTS]
        tokens = [
            self._format_artist_token(self._normalize_artist(artist), strength)
            for artist, strength in zip(artists, strengths)
        ]
        combined = ",".join(token for token in tokens if token)
        return (combined,)


NODE_CLASS_MAPPINGS = {
    "AnimaArtistBrowser": AnimaArtistBrowser,
}

NODE_DISPLAY_NAME_MAPPINGS = {
    "AnimaArtistBrowser": "Anima Artist Browser",
}

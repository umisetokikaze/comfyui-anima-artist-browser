from __future__ import annotations

import re

from typing_extensions import override

from comfy_api.latest import ComfyExtension, io


DEFAULT_ARTIST_STRENGTH = 1.0
MAX_DYNAMIC_ARTIST_SLOTS = 100

AUTOGROW_ARTIST_PATTERN = re.compile(r"^artist(\d+)$")
AUTOGROW_STRENGTH_PATTERN = re.compile(r"^strength(\d+)$")
LEGACY_ARTIST_PATTERN = re.compile(r"^artist_(\d+)$")
LEGACY_STRENGTH_PATTERN = re.compile(r"^strength_(\d+)$")


class AnimaArtistBrowser(io.ComfyNode):
    @classmethod
    def define_schema(cls) -> io.Schema:
        artist_template = io.Autogrow.TemplatePrefix(
            io.String.Input(
                "artist",
                default="",
                multiline=False,
                dynamic_prompts=True,
                tooltip="Artist tag for this slot.",
            ),
            prefix="artist",
            min=1,
            max=MAX_DYNAMIC_ARTIST_SLOTS,
        )
        strength_template = io.Autogrow.TemplatePrefix(
            io.Float.Input(
                "strength",
                default=DEFAULT_ARTIST_STRENGTH,
                min=0.0,
                max=3.0,
                step=0.05,
                tooltip="Artist strength for this slot. 1.0 keeps the plain @artist format.",
            ),
            prefix="strength",
            min=1,
            max=MAX_DYNAMIC_ARTIST_SLOTS,
        )
        return io.Schema(
            node_id="AnimaArtistBrowser",
            display_name="Anima Artist Browser",
            category="Anima",
            description="Builds a single artist tag string by combining expandable artist slots with per-slot strength (up to 100 slots).",
            search_aliases=[
                "artist browser",
                "artist tags",
                "anime artist",
                "artist string",
                "multi artist",
                "artist weight",
                "artist strength",
            ],
            inputs=[
                io.Autogrow.Input("artists", template=artist_template),
                io.Autogrow.Input("strengths", template=strength_template),
            ],
            outputs=[
                io.String.Output(display_name="artist_string", tooltip="Combined artist tags from all selected slots."),
            ],
            accept_all_inputs=True,
        )

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

    @staticmethod
    def _collect_indexed_values(values, pattern, base_index=0):
        indexed = {}
        if not isinstance(values, dict):
            return indexed
        for key, value in values.items():
            match = pattern.match(str(key or ""))
            if not match:
                continue
            indexed[max(0, int(match.group(1)) - base_index)] = value
        return indexed

    @classmethod
    def _collect_slots(cls, artists=None, strengths=None, extra_inputs=None):
        artist_values = cls._collect_indexed_values(artists, AUTOGROW_ARTIST_PATTERN)
        strength_values = cls._collect_indexed_values(strengths, AUTOGROW_STRENGTH_PATTERN)

        if isinstance(extra_inputs, dict):
            for index, value in cls._collect_indexed_values(extra_inputs, LEGACY_ARTIST_PATTERN, base_index=1).items():
                artist_values.setdefault(index, value)
            for index, value in cls._collect_indexed_values(extra_inputs, LEGACY_STRENGTH_PATTERN, base_index=1).items():
                strength_values.setdefault(index, value)

        ordered_indexes = sorted(set(artist_values.keys()) | set(strength_values.keys()))
        return [
            (artist_values.get(index, ""), strength_values.get(index, DEFAULT_ARTIST_STRENGTH))
            for index in ordered_indexes
        ]

    @classmethod
    def execute(cls, artists: io.Autogrow.Type | None = None, strengths: io.Autogrow.Type | None = None, **kwargs) -> io.NodeOutput:
        tokens = [
            cls._format_artist_token(cls._normalize_artist(artist), strength)
            for artist, strength in cls._collect_slots(artists, strengths, kwargs)
        ]
        combined = ",".join(token for token in tokens if token)
        return io.NodeOutput(combined)


class AnimaArtistBrowserExtension(ComfyExtension):
    @override
    async def get_node_list(self) -> list[type[io.ComfyNode]]:
        return [AnimaArtistBrowser]


async def comfy_entrypoint() -> AnimaArtistBrowserExtension:
    return AnimaArtistBrowserExtension()


__all__ = [
    "AnimaArtistBrowser",
    "AnimaArtistBrowserExtension",
    "comfy_entrypoint",
]

from __future__ import annotations

import re

from typing_extensions import override

from comfy_api.latest import ComfyExtension, io


DEFAULT_ARTIST_STRENGTH = 1.0
MAX_DYNAMIC_ARTIST_SLOTS = 100
DEFAULT_ARTIST_SEPARATOR = ","
DEFAULT_WEIGHT_MODE = "auto"

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
            description="Builds a configurable artist tag string by combining expandable artist slots with per-slot strength (up to 100 slots).",
            search_aliases=[
                "artist browser",
                "artist tags",
                "anime artist",
                "artist string",
                "multi artist",
                "artist weight",
                "artist strength",
                "artist separator",
                "artist prefix",
                "artist suffix",
            ],
            inputs=[
                io.Autogrow.Input("artists", template=artist_template),
                io.Autogrow.Input("strengths", template=strength_template),
                io.Combo.Input(
                    "weight_mode",
                    options=["auto", "always_weighted", "plain_tags"],
                    default=DEFAULT_WEIGHT_MODE,
                    tooltip="auto keeps @artist at strength 1.0, always_weighted always emits (tag:strength), plain_tags ignores strength values.",
                ),
                io.String.Input(
                    "separator",
                    default=DEFAULT_ARTIST_SEPARATOR,
                    multiline=False,
                    tooltip=r"Text inserted between artist tokens. Supports \n, \t, \r, and \\ escapes.",
                ),
                io.String.Input(
                    "prefix",
                    default="",
                    multiline=False,
                    dynamic_prompts=True,
                    tooltip=r"Text inserted before the combined artist string. Supports \n, \t, \r, and \\ escapes.",
                ),
                io.String.Input(
                    "suffix",
                    default="",
                    multiline=False,
                    dynamic_prompts=True,
                    tooltip=r"Text appended after the combined artist string. Supports \n, \t, \r, and \\ escapes.",
                ),
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
    def _normalize_weight_mode(cls, value):
        normalized = str(value or "").strip().lower()
        if normalized in {"always", "always_weighted", "weighted", "force_weighted"}:
            return "always_weighted"
        if normalized in {"plain", "plain_tags", "ignore_strength", "no_weights"}:
            return "plain_tags"
        return DEFAULT_WEIGHT_MODE

    @staticmethod
    def _decode_format_text(value, fallback=""):
        text = fallback if value is None else str(value)
        parts = []
        index = 0
        escape_map = {
            "n": "\n",
            "r": "\r",
            "t": "\t",
            "\\": "\\",
        }

        while index < len(text):
            if text[index] != "\\" or index + 1 >= len(text):
                parts.append(text[index])
                index += 1
                continue

            escaped = escape_map.get(text[index + 1])
            if escaped is None:
                parts.append(text[index + 1])
            else:
                parts.append(escaped)
            index += 2

        return "".join(parts)

    @classmethod
    def _format_artist_token(cls, artist, strength, weight_mode=DEFAULT_WEIGHT_MODE):
        if not artist:
            return ""
        normalized_mode = cls._normalize_weight_mode(weight_mode)
        if normalized_mode == "plain_tags":
            return artist
        normalized_strength = cls._normalize_strength(strength)
        if normalized_mode != "always_weighted" and abs(normalized_strength - DEFAULT_ARTIST_STRENGTH) < 1e-9:
            return artist
        return f"({artist}:{cls._format_strength(normalized_strength)})"

    @classmethod
    def _join_artist_tokens(cls, tokens, separator=DEFAULT_ARTIST_SEPARATOR, prefix="", suffix=""):
        joined_tokens = [token for token in tokens if token]
        if not joined_tokens:
            return ""

        resolved_separator = cls._decode_format_text(separator, DEFAULT_ARTIST_SEPARATOR)
        resolved_prefix = cls._decode_format_text(prefix, "")
        resolved_suffix = cls._decode_format_text(suffix, "")
        return f"{resolved_prefix}{resolved_separator.join(joined_tokens)}{resolved_suffix}"

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
    def execute(
        cls,
        artists: io.Autogrow.Type | None = None,
        strengths: io.Autogrow.Type | None = None,
        weight_mode: str = DEFAULT_WEIGHT_MODE,
        separator: str = DEFAULT_ARTIST_SEPARATOR,
        prefix: str = "",
        suffix: str = "",
        **kwargs,
    ) -> io.NodeOutput:
        tokens = [
            cls._format_artist_token(cls._normalize_artist(artist), strength, weight_mode=weight_mode)
            for artist, strength in cls._collect_slots(artists, strengths, kwargs)
        ]
        combined = cls._join_artist_tokens(tokens, separator=separator, prefix=prefix, suffix=suffix)
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

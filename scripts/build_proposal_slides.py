"""Build a corporate travel proposal in Google Slides from a content JSON.

The reference PPTX (`Bariloche_NovNordisk_1.pptx`) is used only as a visual
style guide: palette, typography, and layout patterns. All textual content
comes from `proposal_slides_input/content.json`. Photos come from
`proposal_slides_input/photos/`.

Auth: OAuth user credentials via the same secrets used by the backend
(`GOOGLE_OAUTH_CLIENT_ID`, `GOOGLE_OAUTH_CLIENT_SECRET`,
`GOOGLE_OAUTH_REFRESH_TOKEN`).
"""

from __future__ import annotations

import argparse
import json
import mimetypes
import os
import sys
import time
import uuid
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Iterable

from google.auth.transport.requests import Request
from google.oauth2.credentials import Credentials
from googleapiclient.discovery import build
from googleapiclient.http import MediaFileUpload

# --------------------------------------------------------------------------- #
# Style guide — extracted from reference PPTX                                 #
# --------------------------------------------------------------------------- #


def hex_to_rgb(value: str) -> dict[str, float]:
    """Convert "#RRGGBB" to a Slides API rgbColor dict (0..1 floats)."""
    s = value.strip().lstrip("#")
    r = int(s[0:2], 16) / 255.0
    g = int(s[2:4], 16) / 255.0
    b = int(s[4:6], 16) / 255.0
    return {"red": r, "green": g, "blue": b}


COLORS = {
    "dark":   hex_to_rgb("#1A3224"),
    "cream":  hex_to_rgb("#F5F2EB"),
    "gold":   hex_to_rgb("#C88A22"),
    "white":  hex_to_rgb("#FFFFFF"),
    "muted":  hex_to_rgb("#8A9A8E"),
    "ink":    hex_to_rgb("#333333"),
    "panel":  hex_to_rgb("#E8ECE5"),
    "rule":   hex_to_rgb("#0F2017"),
}

FONTS = {
    "title":      {"family": "Georgia",        "size": 36, "bold": True},
    "title_xl":   {"family": "Georgia",        "size": 54, "bold": True},
    "subtitle":   {"family": "Trebuchet MS",   "size": 14, "bold": False},
    "overline":   {"family": "Trebuchet MS",   "size": 10, "bold": True},
    "label":      {"family": "Trebuchet MS",   "size": 10, "bold": True},
    "body":       {"family": "Calibri",        "size": 12, "bold": False},
    "body_small": {"family": "Calibri",        "size": 10, "bold": False},
    "card_title": {"family": "Georgia",        "size": 18, "bold": True},
    "price":      {"family": "Georgia",        "size": 22, "bold": True},
    "price_lg":   {"family": "Georgia",        "size": 30, "bold": True},
    "section":    {"family": "Georgia",        "size": 60, "bold": True},
}


# --------------------------------------------------------------------------- #
# Geometry — slide is 13.333" x 7.5" (16:9 wide).                             #
# --------------------------------------------------------------------------- #

EMU_PER_INCH = 914400
SLIDE_W_IN = 13.333
SLIDE_H_IN = 7.5


def emu(inches: float) -> int:
    return int(round(inches * EMU_PER_INCH))


SLIDE_SIZE_EMU = {
    "width":  {"magnitude": emu(SLIDE_W_IN), "unit": "EMU"},
    "height": {"magnitude": emu(SLIDE_H_IN), "unit": "EMU"},
}


# --------------------------------------------------------------------------- #
# Request builders                                                            #
# --------------------------------------------------------------------------- #


def _new_id(prefix: str) -> str:
    return f"{prefix}_{uuid.uuid4().hex[:8]}"


def _element_props(page_id: str, x: float, y: float, w: float, h: float) -> dict:
    return {
        "pageObjectId": page_id,
        "size": {
            "width":  {"magnitude": emu(w), "unit": "EMU"},
            "height": {"magnitude": emu(h), "unit": "EMU"},
        },
        "transform": {
            "scaleX": 1, "scaleY": 1,
            "translateX": emu(x), "translateY": emu(y),
            "unit": "EMU",
        },
    }


def _alignment(value: str | None) -> str:
    return {"left": "START", "center": "CENTER", "right": "END"}.get(
        (value or "left").lower(), "START"
    )


def add_rect(
    requests: list[dict],
    page_id: str,
    x: float, y: float, w: float, h: float,
    fill: dict | None,
    *,
    line: dict | None = None,
    line_width_pt: float | None = None,
) -> str:
    """Filled rectangle. `fill` is a Slides rgbColor (or None for no fill)."""
    obj_id = _new_id("rect")
    requests.append({
        "createShape": {
            "objectId": obj_id,
            "shapeType": "RECTANGLE",
            "elementProperties": _element_props(page_id, x, y, w, h),
        }
    })
    shape_props: dict[str, Any] = {}
    fields: list[str] = []
    if fill is not None:
        shape_props["shapeBackgroundFill"] = {
            "solidFill": {"color": {"rgbColor": fill}}
        }
        fields.append("shapeBackgroundFill")
    if line is None and line_width_pt is None:
        shape_props["outline"] = {"propertyState": "NOT_RENDERED"}
        fields.append("outline")
    elif line is not None:
        outline: dict[str, Any] = {
            "outlineFill": {"solidFill": {"color": {"rgbColor": line}}},
            "propertyState": "RENDERED",
        }
        if line_width_pt is not None:
            outline["weight"] = {"magnitude": line_width_pt, "unit": "PT"}
        shape_props["outline"] = outline
        fields.append("outline")
    if shape_props:
        requests.append({
            "updateShapeProperties": {
                "objectId": obj_id,
                "shapeProperties": shape_props,
                "fields": ",".join(fields),
            }
        })
    return obj_id


def add_text(
    requests: list[dict],
    page_id: str,
    text: str,
    x: float, y: float, w: float, h: float,
    *,
    font: dict,
    color: dict,
    align: str = "left",
    line_spacing: float = 115.0,
    letter_spacing: float | None = None,
) -> str:
    """Text box with explicit font, size, bold, color, alignment."""
    obj_id = _new_id("text")
    requests.append({
        "createShape": {
            "objectId": obj_id,
            "shapeType": "TEXT_BOX",
            "elementProperties": _element_props(page_id, x, y, w, h),
        }
    })
    requests.append({"insertText": {"objectId": obj_id, "text": text}})
    style: dict[str, Any] = {
        "fontFamily": font["family"],
        "fontSize": {"magnitude": font["size"], "unit": "PT"},
        "bold": bool(font.get("bold")),
        "italic": bool(font.get("italic")),
        "foregroundColor": {"opaqueColor": {"rgbColor": color}},
    }
    fields = "fontFamily,fontSize,bold,italic,foregroundColor"
    if letter_spacing is not None:
        style["weightedFontFamily"] = {"fontFamily": font["family"], "weight": 700 if font.get("bold") else 400}
    requests.append({
        "updateTextStyle": {
            "objectId": obj_id,
            "textRange": {"type": "ALL"},
            "style": style,
            "fields": fields,
        }
    })
    requests.append({
        "updateParagraphStyle": {
            "objectId": obj_id,
            "textRange": {"type": "ALL"},
            "style": {
                "alignment": _alignment(align),
                "lineSpacing": line_spacing,
            },
            "fields": "alignment,lineSpacing",
        }
    })
    return obj_id


def add_image(
    requests: list[dict],
    page_id: str,
    url: str,
    x: float, y: float, w: float, h: float,
) -> str:
    obj_id = _new_id("img")
    requests.append({
        "createImage": {
            "objectId": obj_id,
            "url": url,
            "elementProperties": _element_props(page_id, x, y, w, h),
        }
    })
    return obj_id


def add_blank_slide(requests: list[dict], slide_id: str | None = None) -> str:
    obj_id = slide_id or _new_id("slide")
    requests.append({
        "createSlide": {
            "objectId": obj_id,
            "slideLayoutReference": {"predefinedLayout": "BLANK"},
        }
    })
    return obj_id


def fill_background(requests: list[dict], page_id: str, color: dict) -> None:
    add_rect(requests, page_id, 0, 0, SLIDE_W_IN, SLIDE_H_IN, color)


def gold_top_bottom_borders(requests: list[dict], page_id: str, thickness_in: float = 0.18) -> None:
    add_rect(requests, page_id, 0, 0, SLIDE_W_IN, thickness_in, COLORS["gold"])
    add_rect(requests, page_id, 0, SLIDE_H_IN - thickness_in, SLIDE_W_IN, thickness_in, COLORS["gold"])


# --------------------------------------------------------------------------- #
# Slide builders — one per slide type                                         #
# --------------------------------------------------------------------------- #


@dataclass
class SlidePlan:
    title: str
    build: callable  # (requests: list, page_id: str) -> None


def build_cover_slide(content: dict) -> SlidePlan:
    def _build(requests: list[dict], page_id: str) -> None:
        fill_background(requests, page_id, COLORS["dark"])
        gold_top_bottom_borders(requests, page_id, 0.20)

        agency = content.get("agency", {}) or {}
        client = content.get("client", "")
        destination = content.get("destination", "")
        date = content.get("date") or ""

        add_text(
            requests, page_id, agency.get("name", "").upper(),
            0.6, 0.55, 12.13, 0.5,
            font=FONTS["overline"], color=COLORS["gold"], align="left",
        )

        add_text(
            requests, page_id, destination.upper() if destination else "",
            0.6, 2.4, 12.13, 1.8,
            font=FONTS["title_xl"], color=COLORS["white"], align="center",
        )
        if client:
            add_text(
                requests, page_id, f"Propuesta para {client}",
                0.6, 4.3, 12.13, 0.55,
                font={**FONTS["subtitle"], "italic": True}, color=COLORS["muted"], align="center",
            )
        if date:
            add_text(
                requests, page_id, date,
                0.6, 5.0, 12.13, 0.45,
                font=FONTS["body"], color=COLORS["muted"], align="center",
            )

        # footer agency tagline
        tagline = agency.get("tagline") or ""
        if tagline:
            add_text(
                requests, page_id, tagline,
                0.6, 6.55, 12.13, 0.4,
                font={**FONTS["body_small"], "italic": True}, color=COLORS["muted"], align="center",
            )

    return SlidePlan(title="Cover", build=_build)


def build_overview_slide(content: dict) -> SlidePlan:
    def _build(requests: list[dict], page_id: str) -> None:
        # split background: dark left third, cream right two-thirds
        add_rect(requests, page_id, 0, 0, SLIDE_W_IN, SLIDE_H_IN, COLORS["cream"])
        add_rect(requests, page_id, 0, 0, 4.4, SLIDE_H_IN, COLORS["dark"])
        # top gold strip on left only (subtle)
        add_rect(requests, page_id, 0, 0, 4.4, 0.14, COLORS["gold"])

        add_text(
            requests, page_id, "PROPUESTA",
            0.45, 0.7, 3.7, 0.4,
            font=FONTS["overline"], color=COLORS["gold"], align="left",
        )
        add_text(
            requests, page_id, "SERVICIOS\nINCLUIDOS",
            0.45, 1.25, 3.7, 2.1,
            font=FONTS["title"], color=COLORS["white"], align="left", line_spacing=110,
        )
        add_text(
            requests, page_id,
            f"{content.get('client', '')} · {content.get('pax', '')} PAX · {content.get('destination', '')}",
            0.45, 6.6, 3.7, 0.4,
            font={**FONTS["body_small"], "italic": True}, color=COLORS["muted"], align="left",
        )

        # cards on the right side
        items: list[tuple[str, str]] = []
        for t in content.get("transfers") or []:
            items.append(("Traslado", t.get("name") or t.get("route") or "Traslado"))
        for r in content.get("restaurants") or []:
            items.append(("Gastronomía", r.get("name") or "Restaurante"))
        for a in content.get("activities") or []:
            items.append(("Actividad", a.get("name") or "Actividad"))

        max_cards = 6
        items = items[:max_cards]
        card_x = 4.85
        card_w = 8.05
        card_h = 0.85
        gap = 0.2
        start_y = 0.95
        for idx, (kind, name) in enumerate(items):
            cy = start_y + idx * (card_h + gap)
            add_rect(requests, page_id, card_x, cy, card_w, card_h, COLORS["white"], line=COLORS["panel"], line_width_pt=0.75)
            add_text(
                requests, page_id, kind.upper(),
                card_x + 0.3, cy + 0.13, 2.0, 0.3,
                font=FONTS["overline"], color=COLORS["gold"], align="left",
            )
            add_text(
                requests, page_id, name,
                card_x + 0.3, cy + 0.4, card_w - 0.6, 0.4,
                font=FONTS["card_title"], color=COLORS["dark"], align="left",
            )

    return SlidePlan(title="Servicios incluidos", build=_build)


def build_transfer_slide(transfer: dict, photos: dict[str, str]) -> SlidePlan:
    def _build(requests: list[dict], page_id: str) -> None:
        fill_background(requests, page_id, COLORS["dark"])
        gold_top_bottom_borders(requests, page_id, 0.16)

        add_text(
            requests, page_id, "TRASLADO",
            0.7, 0.6, 6.0, 0.4,
            font=FONTS["overline"], color=COLORS["gold"], align="left",
        )
        add_text(
            requests, page_id, (transfer.get("name") or "Servicio de Traslado").upper(),
            0.7, 1.05, 6.5, 1.3,
            font=FONTS["title"], color=COLORS["white"], align="left", line_spacing=110,
        )

        meta_lines = []
        if transfer.get("route"):
            meta_lines.append(f"Recorrido: {transfer['route']}")
        meta_lines.append(f"Pax: {transfer.get('pax') or '—'}")
        if transfer.get("provider"):
            meta_lines.append(f"Proveedor: {transfer['provider']}")
        add_text(
            requests, page_id, "\n".join(meta_lines),
            0.7, 2.55, 6.4, 1.0,
            font=FONTS["body"], color=COLORS["muted"], align="left", line_spacing=140,
        )

        description = (transfer.get("description") or "").strip()
        if description:
            add_text(
                requests, page_id, description,
                0.7, 3.7, 6.4, 2.1,
                font=FONTS["body"], color=COLORS["white"], align="left", line_spacing=130,
            )

        # right-side image bleed
        photo_url = (photos.get(transfer.get("id") or "", []) or [None])[0]
        if photo_url:
            add_image(requests, page_id, photo_url, 7.5, 1.0, 5.3, 4.65)

        # gold bottom price banner
        cur = transfer.get("currency") or "USD"
        unit = transfer.get("unit") or 0
        pax = transfer.get("pax") or 0
        subtotal = transfer.get("subtotal") if transfer.get("subtotal") is not None else (unit * pax)
        add_rect(requests, page_id, 0.7, 6.05, 11.93, 0.85, COLORS["gold"])
        add_text(
            requests, page_id,
            f"{cur} {unit:,} / pax",
            0.95, 6.18, 5.5, 0.6,
            font=FONTS["card_title"], color=COLORS["dark"], align="left",
        )
        add_text(
            requests, page_id,
            f"SUBTOTAL  {cur} {subtotal:,}",
            6.45, 6.2, 6.18, 0.6,
            font=FONTS["price"], color=COLORS["dark"], align="right",
        )

    return SlidePlan(title=transfer.get("name") or "Traslado", build=_build)


def build_section_divider(label: str, kicker: str | None = None) -> SlidePlan:
    def _build(requests: list[dict], page_id: str) -> None:
        fill_background(requests, page_id, COLORS["dark"])
        gold_top_bottom_borders(requests, page_id, 0.20)
        if kicker:
            add_text(
                requests, page_id, kicker.upper(),
                0.6, 2.65, 12.13, 0.5,
                font=FONTS["overline"], color=COLORS["gold"], align="center",
            )
        add_text(
            requests, page_id, label.upper(),
            0.6, 3.2, 12.13, 1.5,
            font=FONTS["section"], color=COLORS["white"], align="center", line_spacing=110,
        )
        add_text(
            requests, page_id,
            "—",
            0.6, 4.95, 12.13, 0.4,
            font=FONTS["body"], color=COLORS["muted"], align="center",
        )

    return SlidePlan(title=f"Section: {label}", build=_build)


def build_restaurant_slide(restaurant: dict, photos: dict[str, str]) -> SlidePlan:
    def _build(requests: list[dict], page_id: str) -> None:
        # split: dark left 1/3, cream right 2/3
        add_rect(requests, page_id, 0, 0, SLIDE_W_IN, SLIDE_H_IN, COLORS["cream"])
        add_rect(requests, page_id, 0, 0, 4.6, SLIDE_H_IN, COLORS["dark"])
        # gold horizontal markers on left top + bottom
        add_rect(requests, page_id, 0, 0, 4.6, 0.14, COLORS["gold"])

        number = restaurant.get("number") or "01"
        add_text(
            requests, page_id, number,
            0.45, 0.55, 1.6, 0.7,
            font={"family": "Georgia", "size": 38, "bold": True, "italic": True}, color=COLORS["gold"], align="left",
        )
        add_text(
            requests, page_id, "GASTRONOMÍA",
            0.45, 1.4, 3.7, 0.4,
            font=FONTS["overline"], color=COLORS["gold"], align="left",
        )
        add_text(
            requests, page_id, (restaurant.get("name") or "").upper(),
            0.45, 1.9, 3.85, 1.5,
            font=FONTS["title"], color=COLORS["white"], align="left", line_spacing=105,
        )
        if restaurant.get("description"):
            add_text(
                requests, page_id, restaurant["description"],
                0.45, 3.6, 3.85, 2.0,
                font=FONTS["body_small"], color=COLORS["muted"], align="left", line_spacing=140,
            )
        # left bottom price banner (gold)
        cur = restaurant.get("currency") or "USD"
        price = restaurant.get("price") or restaurant.get("subtotal") or 0
        add_rect(requests, page_id, 0, 6.3, 4.6, 1.2, COLORS["gold"])
        add_text(
            requests, page_id, "POR PERSONA",
            0.45, 6.42, 4.0, 0.32,
            font=FONTS["overline"], color=COLORS["dark"], align="left",
        )
        add_text(
            requests, page_id, f"{cur} {price:,}",
            0.45, 6.78, 4.0, 0.55,
            font=FONTS["price_lg"], color=COLORS["dark"], align="left",
        )

        # right side: image + sections
        photo_url = (photos.get(restaurant.get("id") or "", []) or [None])[0]
        if photo_url:
            add_image(requests, page_id, photo_url, 4.95, 0.6, 8.0, 3.05)

        # menu list
        menu = restaurant.get("menu") or []
        right_x = 4.95
        right_w = 8.05
        if menu:
            add_text(
                requests, page_id, "MENÚ",
                right_x, 3.85, right_w, 0.35,
                font=FONTS["overline"], color=COLORS["gold"], align="left",
            )
            menu_text = "\n".join(f"·  {m}" for m in menu)
            add_text(
                requests, page_id, menu_text,
                right_x, 4.25, right_w, 1.5,
                font=FONTS["body"], color=COLORS["ink"], align="left", line_spacing=140,
            )
        inclusions = restaurant.get("inclusions") or []
        if inclusions:
            inc_y = 5.85
            add_text(
                requests, page_id, "INCLUYE",
                right_x, inc_y, right_w, 0.35,
                font=FONTS["overline"], color=COLORS["gold"], align="left",
            )
            add_text(
                requests, page_id, "  ·  ".join(inclusions),
                right_x, inc_y + 0.4, right_w, 1.0,
                font=FONTS["body_small"], color=COLORS["ink"], align="left", line_spacing=140,
            )

    return SlidePlan(title=restaurant.get("name") or "Restaurante", build=_build)


def build_activity_slide(activity: dict, photos: dict[str, str]) -> SlidePlan:
    def _build(requests: list[dict], page_id: str) -> None:
        fill_background(requests, page_id, COLORS["cream"])

        number = activity.get("number") or "01"
        add_text(
            requests, page_id, "ACTIVIDAD",
            0.7, 0.6, 8.0, 0.35,
            font=FONTS["overline"], color=COLORS["gold"], align="left",
        )
        add_text(
            requests, page_id, number,
            12.0, 0.5, 0.93, 0.55,
            font={"family": "Georgia", "size": 30, "bold": True, "italic": True}, color=COLORS["gold"], align="right",
        )
        add_text(
            requests, page_id, activity.get("name") or "",
            0.7, 1.05, 8.0, 1.4,
            font=FONTS["title"], color=COLORS["dark"], align="left", line_spacing=110,
        )

        description = (activity.get("description") or "").strip()
        if description:
            add_text(
                requests, page_id, description,
                0.7, 2.6, 7.5, 3.1,
                font=FONTS["body"], color=COLORS["ink"], align="left", line_spacing=140,
            )

        # right image
        photo_url = (photos.get(activity.get("id") or "", []) or [None])[0]
        if photo_url:
            add_image(requests, page_id, photo_url, 8.45, 1.05, 4.4, 4.6)

        # bottom dark price banner
        cur = activity.get("currency") or "USD"
        unit = activity.get("unit") or 0
        pax = activity.get("pax") or 0
        subtotal = activity.get("subtotal") if activity.get("subtotal") is not None else (unit * pax)
        add_rect(requests, page_id, 0.7, 6.0, 11.93, 1.0, COLORS["dark"])
        add_text(
            requests, page_id, f"{cur} {unit:,} / pax  ·  {pax} pax",
            0.95, 6.15, 6.0, 0.7,
            font=FONTS["card_title"], color=COLORS["white"], align="left",
        )
        add_text(
            requests, page_id, f"SUBTOTAL  {cur} {subtotal:,}",
            6.95, 6.18, 5.68, 0.7,
            font=FONTS["price"], color=COLORS["gold"], align="right",
        )

    return SlidePlan(title=activity.get("name") or "Actividad", build=_build)


def build_price_summary_slide(content: dict) -> SlidePlan:
    items: list[tuple[str, int, int, int, str]] = []
    for t in content.get("transfers") or []:
        unit = t.get("unit") or 0
        pax = t.get("pax") or 0
        subtotal = t.get("subtotal") if t.get("subtotal") is not None else unit * pax
        items.append((f"Traslado · {t.get('name')}", pax, unit, subtotal, t.get("currency") or "USD"))
    for r in content.get("restaurants") or []:
        unit = r.get("price") or r.get("unit") or 0
        pax = r.get("pax") or content.get("pax") or 0
        subtotal = r.get("subtotal") if r.get("subtotal") is not None else unit * pax
        items.append((f"Gastronomía · {r.get('name')}", pax, unit, subtotal, r.get("currency") or "USD"))
    for a in content.get("activities") or []:
        unit = a.get("unit") or 0
        pax = a.get("pax") or 0
        subtotal = a.get("subtotal") if a.get("subtotal") is not None else unit * pax
        items.append((f"Actividad · {a.get('name')}", pax, unit, subtotal, a.get("currency") or "USD"))

    def _build(requests: list[dict], page_id: str) -> None:
        fill_background(requests, page_id, COLORS["dark"])
        gold_top_bottom_borders(requests, page_id, 0.16)

        add_text(
            requests, page_id, "RESUMEN DE INVERSIÓN",
            0.7, 0.7, 11.93, 0.6,
            font=FONTS["title"], color=COLORS["white"], align="left",
        )
        add_text(
            requests, page_id, content.get("currency_note") or "",
            0.7, 1.35, 11.93, 0.4,
            font={**FONTS["body_small"], "italic": True}, color=COLORS["muted"], align="left",
        )

        # column headers
        header_y = 2.0
        cols = [
            ("CONCEPTO",  0.7,  6.4,  "left"),
            ("PAX",       7.2,  1.0,  "right"),
            ("UNIT",      8.4,  2.0,  "right"),
            ("SUBTOTAL", 10.5,  2.13, "right"),
        ]
        for label, x, w, align in cols:
            add_text(
                requests, page_id, label,
                x, header_y, w, 0.35,
                font=FONTS["overline"], color=COLORS["gold"], align=align,
            )
        add_rect(requests, page_id, 0.7, header_y + 0.45, 11.93, 0.02, COLORS["gold"])

        # rows
        row_h = 0.5
        start_y = header_y + 0.6
        totals_by_cur: dict[str, int] = {}
        for idx, (concept, pax, unit, subtotal, cur) in enumerate(items):
            ry = start_y + idx * row_h
            if idx % 2 == 1:
                add_rect(requests, page_id, 0.7, ry, 11.93, row_h - 0.06, COLORS["rule"])
            add_text(
                requests, page_id, concept,
                0.85, ry + 0.06, 6.2, row_h - 0.1,
                font=FONTS["body"], color=COLORS["white"], align="left",
            )
            add_text(
                requests, page_id, str(pax),
                7.2, ry + 0.06, 1.0, row_h - 0.1,
                font=FONTS["body"], color=COLORS["white"], align="right",
            )
            add_text(
                requests, page_id, f"{cur} {unit:,}",
                8.4, ry + 0.06, 2.0, row_h - 0.1,
                font=FONTS["body"], color=COLORS["white"], align="right",
            )
            add_text(
                requests, page_id, f"{cur} {subtotal:,}",
                10.5, ry + 0.06, 2.13, row_h - 0.1,
                font={**FONTS["body"], "bold": True}, color=COLORS["gold"], align="right",
            )
            totals_by_cur[cur] = totals_by_cur.get(cur, 0) + (subtotal or 0)

        # totals
        total_y = start_y + len(items) * row_h + 0.35
        add_rect(requests, page_id, 0.7, total_y, 11.93, 0.02, COLORS["gold"])
        line = "  ·  ".join(f"{cur} {amount:,}" for cur, amount in totals_by_cur.items()) or "—"
        add_text(
            requests, page_id, "TOTAL",
            0.85, total_y + 0.2, 6.0, 0.55,
            font=FONTS["price"], color=COLORS["white"], align="left",
        )
        add_text(
            requests, page_id, line,
            6.5, total_y + 0.2, 6.13, 0.55,
            font=FONTS["price_lg"], color=COLORS["gold"], align="right",
        )

    return SlidePlan(title="Resumen de inversión", build=_build)


def build_terms_slide(content: dict) -> SlidePlan:
    terms = content.get("terms") or []

    def _build(requests: list[dict], page_id: str) -> None:
        fill_background(requests, page_id, COLORS["cream"])
        add_rect(requests, page_id, 0, 0, SLIDE_W_IN, 0.18, COLORS["gold"])

        add_text(
            requests, page_id, "TÉRMINOS Y CONDICIONES",
            0.7, 0.55, 11.93, 0.7,
            font=FONTS["title"], color=COLORS["dark"], align="left",
        )
        add_text(
            requests, page_id,
            "Lineamientos generales que aplican a esta propuesta.",
            0.7, 1.3, 11.93, 0.4,
            font={**FONTS["body_small"], "italic": True}, color=COLORS["ink"], align="left",
        )

        cols = 2
        rows = max(1, (len(terms) + cols - 1) // cols)
        card_w = (SLIDE_W_IN - 1.4 - (cols - 1) * 0.4) / cols
        card_h = max(1.4, (5.4 - (rows - 1) * 0.4) / rows)
        start_x = 0.7
        start_y = 1.95
        for idx, term in enumerate(terms[: cols * rows]):
            row = idx // cols
            col = idx % cols
            cx = start_x + col * (card_w + 0.4)
            cy = start_y + row * (card_h + 0.4)
            add_rect(requests, page_id, cx, cy, card_w, card_h, COLORS["white"], line=COLORS["panel"], line_width_pt=0.75)
            add_text(
                requests, page_id, term.get("icon") or "•",
                cx + 0.3, cy + 0.25, 0.9, 0.7,
                font={"family": "Calibri", "size": 26, "bold": True}, color=COLORS["gold"], align="left",
            )
            add_text(
                requests, page_id, (term.get("title") or "").upper(),
                cx + 1.15, cy + 0.3, card_w - 1.4, 0.45,
                font=FONTS["card_title"], color=COLORS["dark"], align="left",
            )
            add_text(
                requests, page_id, term.get("body") or "",
                cx + 1.15, cy + 0.85, card_w - 1.4, card_h - 1.0,
                font=FONTS["body"], color=COLORS["ink"], align="left", line_spacing=140,
            )

    return SlidePlan(title="Términos y condiciones", build=_build)


def build_closing_slide(content: dict) -> SlidePlan:
    def _build(requests: list[dict], page_id: str) -> None:
        fill_background(requests, page_id, COLORS["dark"])
        gold_top_bottom_borders(requests, page_id, 0.20)
        add_text(
            requests, page_id, "GRACIAS",
            0.6, 2.6, 12.13, 1.5,
            font=FONTS["section"], color=COLORS["white"], align="center", line_spacing=110,
        )
        agency = (content.get("agency") or {}).get("name") or ""
        add_text(
            requests, page_id, f"Esperamos trabajar juntos en {content.get('destination') or ''}.",
            0.6, 4.4, 12.13, 0.5,
            font={**FONTS["subtitle"], "italic": True}, color=COLORS["muted"], align="center",
        )
        add_text(
            requests, page_id, agency,
            0.6, 5.2, 12.13, 0.45,
            font=FONTS["overline"], color=COLORS["gold"], align="center",
        )

    return SlidePlan(title="Cierre", build=_build)


# --------------------------------------------------------------------------- #
# Composition                                                                 #
# --------------------------------------------------------------------------- #


def plan_presentation(content: dict, photos: dict[str, list[str]]) -> list[SlidePlan]:
    plans: list[SlidePlan] = [build_cover_slide(content), build_overview_slide(content)]

    transfers = content.get("transfers") or []
    for t in transfers:
        plans.append(build_transfer_slide(t, photos))

    restaurants = content.get("restaurants") or []
    if restaurants:
        plans.append(build_section_divider("Gastronomía", "Capítulo"))
        for r in restaurants:
            plans.append(build_restaurant_slide(r, photos))

    activities = content.get("activities") or []
    if activities:
        plans.append(build_section_divider("Actividades", "Capítulo"))
        for a in activities:
            plans.append(build_activity_slide(a, photos))

    plans.append(build_price_summary_slide(content))
    plans.append(build_terms_slide(content))
    plans.append(build_closing_slide(content))
    return plans


# --------------------------------------------------------------------------- #
# Google API plumbing                                                         #
# --------------------------------------------------------------------------- #


SCOPES = [
    "https://www.googleapis.com/auth/presentations",
    "https://www.googleapis.com/auth/drive",
]


def build_credentials() -> Credentials:
    client_id = os.environ.get("GOOGLE_OAUTH_CLIENT_ID")
    client_secret = os.environ.get("GOOGLE_OAUTH_CLIENT_SECRET")
    refresh_token = os.environ.get("GOOGLE_OAUTH_REFRESH_TOKEN")
    if not (client_id and client_secret and refresh_token):
        raise SystemExit("Missing GOOGLE_OAUTH_CLIENT_ID / GOOGLE_OAUTH_CLIENT_SECRET / GOOGLE_OAUTH_REFRESH_TOKEN env")
    # NOTE: do not pass `scopes=` here. Google's token endpoint rejects refresh
    # requests that try to widen the scope of an existing refresh token; the
    # token already carries its issued scopes. This avoids `invalid_scope`.
    creds = Credentials(
        token=None,
        refresh_token=refresh_token,
        client_id=client_id,
        client_secret=client_secret,
        token_uri="https://oauth2.googleapis.com/token",
    )
    creds.refresh(Request())
    return creds


def upload_photo_to_drive(drive, path: Path) -> str:
    mime = mimetypes.guess_type(str(path))[0] or "image/jpeg"
    media = MediaFileUpload(str(path), mimetype=mime, resumable=False)
    file = drive.files().create(
        body={"name": f"proposal_photo_{path.name}"},
        media_body=media,
        fields="id",
        supportsAllDrives=True,
    ).execute()
    file_id = file["id"]
    drive.permissions().create(
        fileId=file_id,
        body={"type": "anyone", "role": "reader"},
        supportsAllDrives=True,
    ).execute()
    # Hosted download URL works for createImage requests.
    return f"https://drive.google.com/uc?export=download&id={file_id}"


def upload_photos(drive, photos_dir: Path, content: dict) -> dict[str, list[str]]:
    out: dict[str, list[str]] = {}
    referenced: set[str] = set()
    for group_key in ("transfers", "restaurants", "activities"):
        for item in content.get(group_key) or []:
            sid = item.get("id")
            if not sid:
                continue
            uploaded: list[str] = []
            for filename in item.get("photos") or []:
                p = photos_dir / filename
                if not p.exists():
                    continue
                url = upload_photo_to_drive(drive, p)
                uploaded.append(url)
                referenced.add(filename)
            if uploaded:
                out[sid] = uploaded
    return out


def render_slide(slides_api, presentation_id: str, plan: SlidePlan) -> None:
    requests: list[dict] = []
    page_id = add_blank_slide(requests)
    plan.build(requests, page_id)
    slides_api.presentations().batchUpdate(
        presentationId=presentation_id, body={"requests": requests}
    ).execute()


def build_presentation(content: dict, photos: dict[str, list[str]], title: str | None = None) -> dict:
    creds = build_credentials()
    slides_api = build("slides", "v1", credentials=creds, cache_discovery=False)
    drive_api = build("drive", "v3", credentials=creds, cache_discovery=False)

    pres_title = title or f"{content.get('client', 'Propuesta')} · {content.get('destination', '')}".strip(" ·")
    pres = slides_api.presentations().create(body={"title": pres_title}).execute()
    presentation_id = pres["presentationId"]

    # delete the default slide
    full = slides_api.presentations().get(presentationId=presentation_id).execute()
    default_slide_id = (full.get("slides") or [{}])[0].get("objectId")
    if default_slide_id:
        slides_api.presentations().batchUpdate(
            presentationId=presentation_id,
            body={"requests": [{"deleteObject": {"objectId": default_slide_id}}]},
        ).execute()

    plans = plan_presentation(content, photos)
    for plan in plans:
        render_slide(slides_api, presentation_id, plan)
        time.sleep(0.05)  # gentle on quota

    folder_id = os.environ.get("GOOGLE_DRIVE_FOLDER_ID")
    if folder_id:
        drive_api.files().update(
            fileId=presentation_id,
            addParents=folder_id,
            fields="id,parents",
            supportsAllDrives=True,
        ).execute()

    return {
        "presentationId": presentation_id,
        "url": f"https://docs.google.com/presentation/d/{presentation_id}/edit",
        "drive_api": drive_api,
        "slides_api": slides_api,
        "plans": [p.title for p in plans],
    }


def export_pptx(drive_api, presentation_id: str, out_path: Path) -> None:
    response = drive_api.files().export(
        fileId=presentation_id,
        mimeType="application/vnd.openxmlformats-officedocument.presentationml.presentation",
    ).execute()
    out_path.write_bytes(response)


# --------------------------------------------------------------------------- #
# Entrypoint                                                                  #
# --------------------------------------------------------------------------- #


def main() -> None:
    parser = argparse.ArgumentParser(description="Build a corporate travel proposal in Google Slides.")
    parser.add_argument("--content", default="scripts/proposal_slides_input/content.json")
    parser.add_argument("--photos-dir", default="scripts/proposal_slides_input/photos")
    parser.add_argument("--export-pptx", default="scripts/proposal_slides_output/proposal.pptx")
    parser.add_argument("--title", default=None)
    args = parser.parse_args()

    content_path = Path(args.content)
    photos_dir = Path(args.photos_dir)
    if not content_path.exists():
        raise SystemExit(f"content.json not found at {content_path}")
    if not photos_dir.exists():
        raise SystemExit(f"photos dir not found at {photos_dir}")

    with content_path.open(encoding="utf-8") as f:
        content = json.load(f)

    creds = build_credentials()
    drive_api = build("drive", "v3", credentials=creds, cache_discovery=False)
    photos = upload_photos(drive_api, photos_dir, content)

    result = build_presentation(content, photos, title=args.title)
    export_path = Path(args.export_pptx)
    export_path.parent.mkdir(parents=True, exist_ok=True)
    export_pptx(result["drive_api"], result["presentationId"], export_path)

    summary = {
        "presentationId": result["presentationId"],
        "url": result["url"],
        "pptx": str(export_path),
        "slides": result["plans"],
    }
    print(json.dumps(summary, indent=2, ensure_ascii=False))


if __name__ == "__main__":
    main()

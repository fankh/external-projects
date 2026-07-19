"""Import a DXF file into the normalized DrawingDocument."""

import re
from collections import Counter
from pathlib import Path

import ezdxf
from ezdxf import recover
from ezdxf.colors import aci2rgb

from app.schemas.drawing import (
    ArcEntity,
    CircleEntity,
    DrawingDocument,
    LayerInfo,
    LineEntity,
    Point2D,
    PolylineEntity,
    TextEntity,
    compute_bounds_from_entities,
)

MTEXT_INLINE_CODE_PATTERN = re.compile(r"\\[A-Za-z][^;\\]*;|\\[A-Za-z]|[{}]")

DXF_UNIT_CODE_TO_NAME = {
    4: "millimeters",
    6: "meters",
}


def _aci_color_to_hex(aci_color_index: int) -> str:
    try:
        red, green, blue = aci2rgb(aci_color_index)
        return f"#{red:02x}{green:02x}{blue:02x}"
    except Exception:
        return "#e8e8e8"


def _strip_mtext_inline_codes(raw_mtext: str) -> str:
    return MTEXT_INLINE_CODE_PATTERN.sub("", raw_mtext).replace("\\P", "\n")


def convert_dxf_to_drawing_document(dxf_file_path: str, drawing_name: str,
                                    source_format: str = "dxf") -> DrawingDocument:
    try:
        dxf_document = ezdxf.readfile(dxf_file_path)
    except ezdxf.DXFStructureError:
        dxf_document, _auditor = recover.readfile(dxf_file_path)

    normalized_entities = []
    skipped_entity_counter: Counter = Counter()
    entity_sequence_number = 0
    block_entity_sequence = 0

    def next_entity_id() -> str:
        nonlocal entity_sequence_number
        entity_sequence_number += 1
        return f"e{entity_sequence_number}"

    for dxf_entity in dxf_document.modelspace():
        dxf_type = dxf_entity.dxftype()
        layer_name = dxf_entity.dxf.layer

        if dxf_type == "LINE":
            normalized_entities.append(LineEntity(
                entityId=next_entity_id(),
                layerName=layer_name,
                startPoint=Point2D(x=dxf_entity.dxf.start.x, y=dxf_entity.dxf.start.y),
                endPoint=Point2D(x=dxf_entity.dxf.end.x, y=dxf_entity.dxf.end.y),
            ))
        elif dxf_type == "LWPOLYLINE":
            vertex_points = [Point2D(x=point[0], y=point[1])
                             for point in dxf_entity.get_points()]
            normalized_entities.append(PolylineEntity(
                entityId=next_entity_id(),
                layerName=layer_name,
                vertexPoints=vertex_points,
                isClosed=bool(dxf_entity.closed),
            ))
        elif dxf_type == "POLYLINE":
            vertex_points = [Point2D(x=vertex.dxf.location.x, y=vertex.dxf.location.y)
                             for vertex in dxf_entity.vertices]
            normalized_entities.append(PolylineEntity(
                entityId=next_entity_id(),
                layerName=layer_name,
                vertexPoints=vertex_points,
                isClosed=bool(dxf_entity.is_closed),
            ))
        elif dxf_type == "CIRCLE":
            normalized_entities.append(CircleEntity(
                entityId=next_entity_id(),
                layerName=layer_name,
                centerPoint=Point2D(x=dxf_entity.dxf.center.x, y=dxf_entity.dxf.center.y),
                radius=dxf_entity.dxf.radius,
            ))
        elif dxf_type == "ARC":
            normalized_entities.append(ArcEntity(
                entityId=next_entity_id(),
                layerName=layer_name,
                centerPoint=Point2D(x=dxf_entity.dxf.center.x, y=dxf_entity.dxf.center.y),
                radius=dxf_entity.dxf.radius,
                startAngleDegrees=dxf_entity.dxf.start_angle,
                endAngleDegrees=dxf_entity.dxf.end_angle,
            ))
        elif dxf_type == "TEXT":
            normalized_entities.append(TextEntity(
                entityId=next_entity_id(),
                layerName=layer_name,
                insertionPoint=Point2D(x=dxf_entity.dxf.insert.x, y=dxf_entity.dxf.insert.y),
                textContent=dxf_entity.dxf.text,
                textHeight=dxf_entity.dxf.height,
                rotationDegrees=dxf_entity.dxf.rotation,
            ))
        elif dxf_type == "MTEXT":
            normalized_entities.append(TextEntity(
                entityId=next_entity_id(),
                layerName=layer_name,
                insertionPoint=Point2D(x=dxf_entity.dxf.insert.x, y=dxf_entity.dxf.insert.y),
                textContent=_strip_mtext_inline_codes(dxf_entity.text),
                textHeight=dxf_entity.dxf.char_height,
                rotationDegrees=dxf_entity.dxf.rotation,
            ))
        elif dxf_type == "INSERT":
            # U2 — Block 참조 전개 렌더 (파생 엔티티는 b-id: 물리 엔티티 e-순번 보존 → 편집 id 정합)
            try:
                sub_entities = list(dxf_entity.virtual_entities())
            except Exception:
                sub_entities = []
            for sub in sub_entities:
                sub_type = sub.dxftype()
                block_entity_sequence += 1
                sub_id = f"b{block_entity_sequence}"
                sub_layer = sub.dxf.layer if sub.dxf.hasattr("layer") else layer_name
                if sub_type == "LINE":
                    normalized_entities.append(LineEntity(
                        entityId=sub_id, layerName=sub_layer,
                        startPoint=Point2D(x=sub.dxf.start.x, y=sub.dxf.start.y),
                        endPoint=Point2D(x=sub.dxf.end.x, y=sub.dxf.end.y)))
                elif sub_type == "LWPOLYLINE":
                    normalized_entities.append(PolylineEntity(
                        entityId=sub_id, layerName=sub_layer,
                        vertexPoints=[Point2D(x=pt[0], y=pt[1]) for pt in sub.get_points()],
                        isClosed=bool(sub.closed)))
                elif sub_type == "CIRCLE":
                    normalized_entities.append(CircleEntity(
                        entityId=sub_id, layerName=sub_layer,
                        centerPoint=Point2D(x=sub.dxf.center.x, y=sub.dxf.center.y),
                        radius=sub.dxf.radius))
                elif sub_type == "ARC":
                    normalized_entities.append(ArcEntity(
                        entityId=sub_id, layerName=sub_layer,
                        centerPoint=Point2D(x=sub.dxf.center.x, y=sub.dxf.center.y),
                        radius=sub.dxf.radius,
                        startAngleDegrees=sub.dxf.start_angle,
                        endAngleDegrees=sub.dxf.end_angle))
                elif sub_type == "TEXT":
                    normalized_entities.append(TextEntity(
                        entityId=sub_id, layerName=sub_layer,
                        insertionPoint=Point2D(x=sub.dxf.insert.x, y=sub.dxf.insert.y),
                        textContent=sub.dxf.text, textHeight=sub.dxf.height,
                        rotationDegrees=sub.dxf.rotation))
                else:
                    block_entity_sequence -= 1
                    skipped_entity_counter[f"INSERT:{sub_type}"] += 1
        else:
            skipped_entity_counter[dxf_type] += 1

    used_layer_names = {entity.layerName for entity in normalized_entities}
    layers = []
    for layer in dxf_document.layers:
        if layer.dxf.name in used_layer_names:
            layers.append(LayerInfo(
                layerName=layer.dxf.name,
                colorHex=_aci_color_to_hex(layer.color),
            ))
    # Layers referenced by entities but missing from the layer table
    for orphan_layer_name in used_layer_names - {layer.layerName for layer in layers}:
        layers.append(LayerInfo(layerName=orphan_layer_name))

    units = DXF_UNIT_CODE_TO_NAME.get(
        dxf_document.header.get("$INSUNITS", 0), "unitless")

    return DrawingDocument(
        drawingName=drawing_name or Path(dxf_file_path).stem,
        sourceFormat=source_format,
        units=units,
        bounds=compute_bounds_from_entities(normalized_entities),
        layers=sorted(layers, key=lambda layer: layer.layerName),
        entities=normalized_entities,
        skippedEntityCounts=dict(skipped_entity_counter),
    )

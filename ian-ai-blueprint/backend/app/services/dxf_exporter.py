"""Export a normalized DrawingDocument to a DXF (R2010) file."""

import io

import ezdxf

from app.schemas.drawing import (
    ArcEntity,
    CircleEntity,
    DrawingDocument,
    LineEntity,
    PolylineEntity,
    TextEntity,
)


def convert_drawing_document_to_dxf_bytes(drawing_document: DrawingDocument) -> bytes:
    dxf_document = ezdxf.new("R2010", setup=True)
    modelspace = dxf_document.modelspace()

    for layer_info in drawing_document.layers:
        if layer_info.layerName not in dxf_document.layers:
            dxf_document.layers.add(layer_info.layerName)

    for entity in drawing_document.entities:
        entity_attributes = {"layer": entity.layerName}

        if isinstance(entity, LineEntity):
            modelspace.add_line(
                (entity.startPoint.x, entity.startPoint.y),
                (entity.endPoint.x, entity.endPoint.y),
                dxfattribs=entity_attributes,
            )
        elif isinstance(entity, PolylineEntity):
            modelspace.add_lwpolyline(
                [(vertex.x, vertex.y) for vertex in entity.vertexPoints],
                close=entity.isClosed,
                dxfattribs=entity_attributes,
            )
        elif isinstance(entity, CircleEntity):
            modelspace.add_circle(
                (entity.centerPoint.x, entity.centerPoint.y),
                entity.radius,
                dxfattribs=entity_attributes,
            )
        elif isinstance(entity, ArcEntity):
            modelspace.add_arc(
                (entity.centerPoint.x, entity.centerPoint.y),
                entity.radius,
                entity.startAngleDegrees,
                entity.endAngleDegrees,
                dxfattribs=entity_attributes,
            )
        elif isinstance(entity, TextEntity):
            modelspace.add_text(
                entity.textContent,
                height=entity.textHeight,
                rotation=entity.rotationDegrees,
                dxfattribs={**entity_attributes,
                            "insert": (entity.insertionPoint.x, entity.insertionPoint.y)},
            )

    text_stream = io.StringIO()
    dxf_document.write(text_stream)
    return text_stream.getvalue().encode("utf-8")

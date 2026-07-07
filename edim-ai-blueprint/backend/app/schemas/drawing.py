"""Normalized 2D drawing schema.

Every importer (DXF / DWG / IFC) and the AI generator produces a
DrawingDocument; the frontend renders only this shape and the DXF
exporter consumes it.
"""

from typing import Annotated, Literal, Union

from pydantic import BaseModel, Field


class Point2D(BaseModel):
    x: float
    y: float


class DrawingBounds(BaseModel):
    minX: float
    minY: float
    maxX: float
    maxY: float


class LayerInfo(BaseModel):
    layerName: str
    colorHex: str = "#e8e8e8"
    isVisible: bool = True


class LineEntity(BaseModel):
    entityId: str
    entityType: Literal["line"] = "line"
    layerName: str
    startPoint: Point2D
    endPoint: Point2D


class PolylineEntity(BaseModel):
    entityId: str
    entityType: Literal["polyline"] = "polyline"
    layerName: str
    vertexPoints: list[Point2D]
    isClosed: bool = False


class CircleEntity(BaseModel):
    entityId: str
    entityType: Literal["circle"] = "circle"
    layerName: str
    centerPoint: Point2D
    radius: float


class ArcEntity(BaseModel):
    entityId: str
    entityType: Literal["arc"] = "arc"
    layerName: str
    centerPoint: Point2D
    radius: float
    startAngleDegrees: float
    endAngleDegrees: float


class TextEntity(BaseModel):
    entityId: str
    entityType: Literal["text"] = "text"
    layerName: str
    insertionPoint: Point2D
    textContent: str
    textHeight: float
    rotationDegrees: float = 0.0


DrawingEntity = Annotated[
    Union[LineEntity, PolylineEntity, CircleEntity, ArcEntity, TextEntity],
    Field(discriminator="entityType"),
]


class DrawingDocument(BaseModel):
    drawingName: str
    sourceFormat: Literal["dxf", "dwg", "ifc", "ai-generated"]
    units: Literal["millimeters", "meters", "unitless"] = "millimeters"
    bounds: DrawingBounds
    layers: list[LayerInfo]
    entities: list[DrawingEntity]
    skippedEntityCounts: dict[str, int] = Field(default_factory=dict)


def compute_bounds_from_entities(entities: list) -> DrawingBounds:
    """Compute an axis-aligned bounding box over all entity geometry."""
    collected_x: list[float] = []
    collected_y: list[float] = []

    for entity in entities:
        if isinstance(entity, LineEntity):
            collected_x += [entity.startPoint.x, entity.endPoint.x]
            collected_y += [entity.startPoint.y, entity.endPoint.y]
        elif isinstance(entity, PolylineEntity):
            collected_x += [vertex.x for vertex in entity.vertexPoints]
            collected_y += [vertex.y for vertex in entity.vertexPoints]
        elif isinstance(entity, (CircleEntity, ArcEntity)):
            collected_x += [entity.centerPoint.x - entity.radius,
                            entity.centerPoint.x + entity.radius]
            collected_y += [entity.centerPoint.y - entity.radius,
                            entity.centerPoint.y + entity.radius]
        elif isinstance(entity, TextEntity):
            collected_x.append(entity.insertionPoint.x)
            collected_y.append(entity.insertionPoint.y)

    if not collected_x:
        return DrawingBounds(minX=0, minY=0, maxX=100, maxY=100)

    return DrawingBounds(
        minX=min(collected_x),
        minY=min(collected_y),
        maxX=max(collected_x),
        maxY=max(collected_y),
    )

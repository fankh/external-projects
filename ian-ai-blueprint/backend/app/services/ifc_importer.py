"""Import an IFC model as a 2D DrawingDocument.

Scaffold-level extraction: for the requested storey/container, each
contained product's mesh is projected onto the XY plane and its 2D
boundary edges are emitted as polylines (planar projection, NOT a true
horizontal section cut). Layer name = IFC class (IfcWall, ...).

Note: IFC is an architectural BIM format; for product/industrial drawings
DXF and DWG are the primary inputs. IFC support is kept for completeness.
"""

from collections import Counter

import ifcopenshell
import ifcopenshell.geom
from fastapi import HTTPException

from app.schemas.drawing import (
    DrawingDocument,
    LayerInfo,
    Point2D,
    PolylineEntity,
    compute_bounds_from_entities,
)

IFC_CLASS_COLOR_HEX = {
    "IfcWall": "#e8e8e8",
    "IfcWallStandardCase": "#e8e8e8",
    "IfcColumn": "#f5a623",
    "IfcDoor": "#4a90d9",
    "IfcWindow": "#7ed6c4",
    "IfcSlab": "#666666",
    "IfcStair": "#c586c0",
}

PLAN_RELEVANT_IFC_CLASSES = tuple(IFC_CLASS_COLOR_HEX) + ("IfcBeam", "IfcRailing", "IfcFurnishingElement")


def _collect_storey_products(ifc_model, storey) -> list:
    contained_products = []
    for containment_relation in getattr(storey, "ContainsElements", []) or []:
        contained_products.extend(containment_relation.RelatedElements)
    return [product for product in contained_products
            if product.is_a() in PLAN_RELEVANT_IFC_CLASSES or any(
                product.is_a(plan_class) for plan_class in ("IfcWall", "IfcDoor", "IfcWindow"))]


def _project_mesh_boundary_edges(shape_geometry) -> list[list[Point2D]]:
    """Project triangle mesh to XY and return boundary edge chains.

    A boundary edge (in the projected footprint sense) is approximated as an
    edge used by exactly one face after vertical faces collapse in projection.
    For a scaffold we simply emit each unique projected edge once, merged into
    short polylines per edge.
    """
    vertex_coordinates = shape_geometry.verts  # flat [x0, y0, z0, x1, ...]
    face_vertex_indices = shape_geometry.faces  # flat [a0, b0, c0, a1, ...]

    projected_points = [
        (round(vertex_coordinates[i], 4), round(vertex_coordinates[i + 1], 4))
        for i in range(0, len(vertex_coordinates), 3)
    ]

    edge_usage_counter: Counter = Counter()
    for face_start in range(0, len(face_vertex_indices), 3):
        triangle = [face_vertex_indices[face_start + offset] for offset in range(3)]
        for edge_index in range(3):
            point_a = projected_points[triangle[edge_index]]
            point_b = projected_points[triangle[(edge_index + 1) % 3]]
            if point_a == point_b:
                continue  # vertical edge collapsed in projection
            edge_usage_counter[tuple(sorted((point_a, point_b)))] += 1

    boundary_edges = [edge for edge, usage_count in edge_usage_counter.items()
                      if usage_count == 1]
    return [
        [Point2D(x=point_a[0], y=point_a[1]), Point2D(x=point_b[0], y=point_b[1])]
        for point_a, point_b in boundary_edges
    ]


def extract_floor_plan_drawing(ifc_file_path: str, drawing_name: str,
                               storey_index: int = 0) -> DrawingDocument:
    ifc_model = ifcopenshell.open(ifc_file_path)

    storeys = ifc_model.by_type("IfcBuildingStorey")
    if not storeys:
        raise HTTPException(status_code=422, detail="IFC 파일에 IfcBuildingStorey가 없습니다.")
    if storey_index < 0 or storey_index >= len(storeys):
        raise HTTPException(
            status_code=422,
            detail=f"storeyIndex {storey_index}가 범위를 벗어났습니다 (층 수: {len(storeys)}).",
        )

    geometry_settings = ifcopenshell.geom.settings()
    geometry_settings.set(geometry_settings.USE_WORLD_COORDS, True)

    normalized_entities = []
    skipped_entity_counter: Counter = Counter()
    entity_sequence_number = 0

    for product in _collect_storey_products(ifc_model, storeys[storey_index]):
        if not product.Representation:
            continue
        try:
            product_shape = ifcopenshell.geom.create_shape(geometry_settings, product)
        except Exception:
            skipped_entity_counter[product.is_a()] += 1
            continue

        for edge_chain in _project_mesh_boundary_edges(product_shape.geometry):
            entity_sequence_number += 1
            normalized_entities.append(PolylineEntity(
                entityId=f"e{entity_sequence_number}",
                layerName=product.is_a(),
                vertexPoints=edge_chain,
            ))

    used_layer_names = sorted({entity.layerName for entity in normalized_entities})
    layers = [
        LayerInfo(layerName=layer_name,
                  colorHex=IFC_CLASS_COLOR_HEX.get(layer_name, "#e8e8e8"))
        for layer_name in used_layer_names
    ]

    return DrawingDocument(
        drawingName=drawing_name,
        sourceFormat="ifc",
        units="meters",
        bounds=compute_bounds_from_entities(normalized_entities),
        layers=layers,
        entities=normalized_entities,
        skippedEntityCounts=dict(skipped_entity_counter),
    )

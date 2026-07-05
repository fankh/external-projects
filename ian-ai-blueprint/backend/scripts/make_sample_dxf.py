"""Generate sample_data/sample_floorplan.dxf covering every entity type
the importer and renderer support (line, polyline, circle, arc, text)."""

from pathlib import Path

import ezdxf

OUTPUT_PATH = Path(__file__).resolve().parent.parent / "sample_data" / "sample_floorplan.dxf"


def build_sample_floorplan() -> None:
    dxf_document = ezdxf.new("R2010", setup=True)
    dxf_document.header["$INSUNITS"] = 4  # millimeters

    for layer_name, aci_color in [("WALLS", 7), ("DOORS", 5),
                                  ("FIXTURES", 2), ("ANNOTATIONS", 3)]:
        dxf_document.layers.add(layer_name, color=aci_color)

    modelspace = dxf_document.modelspace()

    # Outer walls (closed polyline) 12m x 9m
    modelspace.add_lwpolyline(
        [(0, 0), (12000, 0), (12000, 9000), (0, 9000)],
        close=True, dxfattribs={"layer": "WALLS"})

    # Interior wall with a door opening
    modelspace.add_line((7000, 0), (7000, 5500), dxfattribs={"layer": "WALLS"})
    modelspace.add_line((7000, 7000), (7000, 9000), dxfattribs={"layer": "WALLS"})

    # Door swing arc
    modelspace.add_arc((7000, 7000), 1500, 180, 270, dxfattribs={"layer": "DOORS"})

    # Round fixture (e.g. table)
    modelspace.add_circle((10500, 7500), 600, dxfattribs={"layer": "FIXTURES"})

    # Room labels
    modelspace.add_text("거실", height=300,
                        dxfattribs={"layer": "ANNOTATIONS", "insert": (3000, 4500)})
    modelspace.add_text("침실", height=300,
                        dxfattribs={"layer": "ANNOTATIONS", "insert": (9000, 3000)})

    OUTPUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    dxf_document.saveas(OUTPUT_PATH)
    print(f"Sample DXF written to {OUTPUT_PATH}")


if __name__ == "__main__":
    build_sample_floorplan()

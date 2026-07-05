"""Generate sample_data/sample_product.dxf covering every entity type the
importer and renderer support (line, polyline, circle, arc, text).

The sample is a smartphone front outline — product/industrial design, not
architecture.
"""

from pathlib import Path

import ezdxf

OUTPUT_PATH = Path(__file__).resolve().parent.parent / "sample_data" / "sample_product.dxf"


def build_sample_product() -> None:
    dxf_document = ezdxf.new("R2010", setup=True)
    dxf_document.header["$INSUNITS"] = 4  # millimeters

    for layer_name, aci_color in [("OUTLINE", 7), ("CUTOUT", 2),
                                  ("COMPONENT", 5), ("ANNOTATION", 3)]:
        dxf_document.layers.add(layer_name, color=aci_color)

    modelspace = dxf_document.modelspace()

    # Body outline: rounded rectangle (72 x 148 mm, corner radius 10)
    modelspace.add_line((10, 0), (62, 0), dxfattribs={"layer": "OUTLINE"})
    modelspace.add_line((72, 10), (72, 138), dxfattribs={"layer": "OUTLINE"})
    modelspace.add_line((62, 148), (10, 148), dxfattribs={"layer": "OUTLINE"})
    modelspace.add_line((0, 138), (0, 10), dxfattribs={"layer": "OUTLINE"})
    modelspace.add_arc((10, 10), 10, 180, 270, dxfattribs={"layer": "OUTLINE"})
    modelspace.add_arc((62, 10), 10, 270, 360, dxfattribs={"layer": "OUTLINE"})
    modelspace.add_arc((62, 138), 10, 0, 90, dxfattribs={"layer": "OUTLINE"})
    modelspace.add_arc((10, 138), 10, 90, 180, dxfattribs={"layer": "OUTLINE"})

    # Screen (inner rectangle)
    modelspace.add_lwpolyline(
        [(5, 14), (67, 14), (67, 134), (5, 134)],
        close=True, dxfattribs={"layer": "OUTLINE"})

    # Earpiece slot + front camera lens
    modelspace.add_line((31, 141), (41, 141), dxfattribs={"layer": "CUTOUT"})
    modelspace.add_circle((50, 141), 1.6, dxfattribs={"layer": "COMPONENT"})

    # Side buttons (power + volume) and bottom USB-C port
    modelspace.add_lwpolyline(
        [(72, 100), (74, 100), (74, 122), (72, 122)],
        close=True, dxfattribs={"layer": "CUTOUT"})
    modelspace.add_lwpolyline(
        [(-2, 106), (0, 106), (0, 140), (-2, 140)],
        close=True, dxfattribs={"layer": "CUTOUT"})
    modelspace.add_lwpolyline(
        [(30, -2), (42, -2), (42, 0), (30, 0)],
        close=True, dxfattribs={"layer": "CUTOUT"})

    # Labels
    modelspace.add_text("SCREEN", height=5,
                        dxfattribs={"layer": "ANNOTATION", "insert": (20, 74)})
    modelspace.add_text("SAMPLE", height=4,
                        dxfattribs={"layer": "ANNOTATION", "insert": (-2, 154)})

    OUTPUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    dxf_document.saveas(OUTPUT_PATH)
    print(f"Sample DXF written to {OUTPUT_PATH}")


if __name__ == "__main__":
    build_sample_product()

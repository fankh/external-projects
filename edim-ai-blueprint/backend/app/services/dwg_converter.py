"""Pluggable DWG -> DXF conversion.

DWG is a proprietary binary format; this scaffold shells out to the
ODA File Converter when ODA_FILE_CONVERTER_PATH is configured.
LibreDWG's dwg2dxf can be added later as a second implementation.
"""

import subprocess
import tempfile
from pathlib import Path
from typing import Protocol

from fastapi import HTTPException

from app.config import settings


class DwgToDxfConverter(Protocol):
    def convert(self, input_dwg_path: str) -> str:
        """Convert a DWG file and return the path of the produced DXF."""
        ...


class OdaFileConverter:
    """Wraps the ODA File Converter CLI (folder-in, folder-out interface)."""

    def __init__(self, converter_executable_path: str):
        self.converter_executable_path = converter_executable_path

    def convert(self, input_dwg_path: str) -> str:
        input_folder = str(Path(input_dwg_path).parent)
        output_folder = tempfile.mkdtemp(prefix="dwg2dxf_")

        # Arguments: input folder, output folder, output version, output type
        # (ACAD2010 DXF), recurse flag, audit flag, input file filter.
        conversion_result = subprocess.run(
            [
                self.converter_executable_path,
                input_folder,
                output_folder,
                "ACAD2010",
                "DXF",
                "0",
                "1",
                Path(input_dwg_path).name,
            ],
            capture_output=True,
            timeout=120,
        )

        expected_dxf_path = Path(output_folder) / (Path(input_dwg_path).stem + ".dxf")
        if conversion_result.returncode != 0 or not expected_dxf_path.exists():
            raise HTTPException(
                status_code=422,
                detail="DWG 파일을 DXF로 변환하지 못했습니다. 파일이 손상되었거나 지원되지 않는 버전일 수 있습니다.",
            )
        return str(expected_dxf_path)


def get_configured_dwg_converter() -> DwgToDxfConverter:
    if not settings.oda_file_converter_path:
        raise HTTPException(
            status_code=501,
            detail=(
                "DWG 변환기가 설정되지 않았습니다. "
                "ODA_FILE_CONVERTER_PATH 환경변수에 ODA File Converter 실행 파일 경로를 설정하세요. "
                "DXF 또는 IFC 파일은 변환기 없이 업로드할 수 있습니다."
            ),
        )
    return OdaFileConverter(settings.oda_file_converter_path)

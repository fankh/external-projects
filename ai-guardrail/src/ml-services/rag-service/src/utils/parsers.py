import io
import logging
from pathlib import Path

logger = logging.getLogger(__name__)


def parse_file(file_name: str, data: bytes) -> str:
    """Auto-detect file type by extension and extract text content."""
    ext = Path(file_name).suffix.lower()
    parsers = {
        ".pdf": parse_pdf,
        ".docx": parse_docx,
        ".doc": parse_docx,
        ".txt": parse_txt,
        ".md": parse_markdown,
        ".markdown": parse_markdown,
        ".csv": parse_txt,
        ".json": parse_txt,
        ".xml": parse_txt,
        ".html": parse_txt,
        ".htm": parse_txt,
    }
    parser = parsers.get(ext, parse_txt)
    try:
        return parser(data)
    except Exception:
        logger.exception("Failed to parse %s with primary parser, falling back to raw text", file_name)
        return parse_txt(data)


def parse_pdf(data: bytes) -> str:
    """Extract text from a PDF using pdfplumber."""
    try:
        import pdfplumber
    except ImportError:
        logger.warning("pdfplumber not installed, returning raw text fallback for PDF")
        return data.decode("utf-8", errors="replace")

    pages_text: list[str] = []
    with pdfplumber.open(io.BytesIO(data)) as pdf:
        for page in pdf.pages:
            text = page.extract_text()
            if text:
                pages_text.append(text)
    return "\n\n".join(pages_text)


def parse_docx(data: bytes) -> str:
    """Extract text from a .docx file."""
    try:
        from docx import Document
    except ImportError:
        logger.warning("python-docx not installed, returning raw text fallback for DOCX")
        return data.decode("utf-8", errors="replace")

    doc = Document(io.BytesIO(data))
    paragraphs = [p.text for p in doc.paragraphs if p.text.strip()]
    return "\n\n".join(paragraphs)


def parse_txt(data: bytes) -> str:
    """Decode bytes as UTF-8 text."""
    return data.decode("utf-8", errors="replace")


def parse_markdown(data: bytes) -> str:
    """Parse markdown -- essentially plain text with formatting preserved."""
    return data.decode("utf-8", errors="replace")

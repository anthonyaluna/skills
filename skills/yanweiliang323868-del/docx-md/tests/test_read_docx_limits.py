"""Offline regression checks for ordinary DOCX input and bounded ZIP reads."""

import importlib.util
import io
from pathlib import Path
import tempfile
import unittest
from unittest.mock import Mock
import zipfile


reader_path = Path(__file__).resolve().parents[1] / "scripts" / "read_docx.py"
spec = importlib.util.spec_from_file_location("docx_reader", reader_path)
reader = importlib.util.module_from_spec(spec)
spec.loader.exec_module(reader)


class DocxReaderTests(unittest.TestCase):
    def test_reads_document_and_optional_comments(self):
        with tempfile.TemporaryDirectory() as folder:
            path = Path(folder, "review.docx")
            ns = reader.W_NS
            with zipfile.ZipFile(path, "w", zipfile.ZIP_DEFLATED) as archive:
                archive.writestr(
                    "word/document.xml",
                    f'<w:document xmlns:w="{ns}"><w:body><w:p><w:r><w:t>Review</w:t>'
                    "</w:r></w:p></w:body></w:document>",
                )
            self.assertIn("Review", reader._blocks_to_md(reader.read_docx(path)))
            self.assertEqual(reader.read_docx(path)["comments"], [])
            with zipfile.ZipFile(path, "a", zipfile.ZIP_DEFLATED) as archive:
                archive.writestr(
                    "word/comments.xml",
                    f'<w:comments xmlns:w="{ns}"><w:comment w:id="1"><w:p><w:r>'
                    "<w:t>Approved</w:t></w:r></w:p></w:comment></w:comments>",
                )
            self.assertEqual(reader.read_docx(path)["comments"][0]["text"], "Approved")

    def test_reader_limits_each_request_and_checks_remaining_budget(self):
        class SizedReads(io.BytesIO):
            def read(self, size=-1):
                if not 0 < size <= 64 * 1024:
                    raise AssertionError("Expected a positive bounded read")
                return super().read(size)

        payload = b"Ordinary document text. " * 4000
        archive = Mock()
        archive.getinfo.return_value = zipfile.ZipInfo("word/document.xml")
        archive.getinfo.return_value.file_size = len(payload)
        archive.getinfo.return_value.compress_size = len(payload)
        archive.open.side_effect = lambda _part: SizedReads(payload)
        self.assertEqual(
            reader.read_part(archive, "word/document.xml", len(payload)), payload
        )
        with self.assertRaisesRegex(ValueError, "exceeds reader limits"):
            reader.read_part(archive, "word/document.xml", 12)

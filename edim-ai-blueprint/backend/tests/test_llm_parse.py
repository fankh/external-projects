# -*- coding: utf-8 -*-
"""LLM 응답 파싱 유닛 테스트 — DB·SDK·크레딧 불요.

이 경로는 **크레딧이 복구되면 가장 먼저 실행**되는데, 크레딧이 없는 동안에는
아예 돌지 않아 결함이 잠복한다. 모델 출력은 통제 밖이므로 여기서 미리 굳혀 둔다.
"""
import pytest

from app.services.llm_parse import extract_json, text_of


class _Block:
    def __init__(self, type_, text=None):
        self.type = type_
        if text is not None:
            self.text = text


class _Msg:
    def __init__(self, blocks):
        self.content = blocks


# ── extract_json ──
def test_plain_json():
    assert extract_json('{"a": 1}') == {"a": 1}


def test_json_in_code_fence():
    """모델이 ```json 펜스로 감싸는 경우 — 실제로 자주 발생한다."""
    raw = '```json\n{"formula": "A + 1", "description": "설명"}\n```'
    assert extract_json(raw)["formula"] == "A + 1"


def test_json_with_prose_around():
    raw = '요청하신 식은 다음과 같습니다.\n{"formula": "B * 2"}\n도움이 되었길 바랍니다.'
    assert extract_json(raw)["formula"] == "B * 2"


def test_nested_object_kept_whole():
    """중첩 객체가 있어도 바깥 '{'~마지막 '}' 를 잡아 전체를 살린다."""
    raw = 'text {"widgets": [{"kind": "ComboBox", "x": 1}], "notes": "n"} tail'
    out = extract_json(raw)
    assert out["widgets"][0]["kind"] == "ComboBox"
    assert out["notes"] == "n"


def test_multiline_json():
    raw = '{\n  "a": 1,\n  "b": [1, 2, 3]\n}'
    assert extract_json(raw)["b"] == [1, 2, 3]


def test_korean_content_preserved():
    out = extract_json('{"description": "MC 가 500 초과면 합계"}')
    assert "초과" in out["description"]


@pytest.mark.parametrize("bad,reason", [
    ("", "빈 응답"),
    ("   ", "빈 응답"),
    ("JSON 이 전혀 없는 답변", "JSON 없음"),
    ("[1, 2, 3]", "JSON 없음"),          # 배열만 — 객체 패턴 불일치
])
def test_invalid_raises_not_silent(bad, reason):
    """조용히 빈 dict 를 돌려주면 '빈 답' 과 '파싱 실패' 를 구분할 수 없다."""
    with pytest.raises(ValueError) as e:
        extract_json(bad)
    assert reason in str(e.value)


def test_malformed_json_raises():
    with pytest.raises(Exception):
        extract_json('{"a": }')


def test_non_string_input_raises():
    with pytest.raises(ValueError):
        extract_json(None)  # type: ignore[arg-type]


# ── text_of ──
def test_text_block_only():
    assert text_of(_Msg([_Block("text", "답변")])) == "답변"


def test_thinking_block_first_is_skipped():
    """opus-5 등 thinking 모델 — 첫 블록이 text 가 아니다 (9.50 실결함 회귀 방지)."""
    msg = _Msg([_Block("thinking", "내부 추론"), _Block("text", "실제 답변")])
    assert text_of(msg) == "실제 답변"


def test_multiple_text_blocks_joined():
    msg = _Msg([_Block("text", "앞"), _Block("thinking", "x"), _Block("text", "뒤")])
    assert text_of(msg) == "앞뒤"


def test_no_text_block_returns_empty():
    assert text_of(_Msg([_Block("thinking", "추론만")])) == ""


def test_empty_or_missing_content():
    assert text_of(_Msg([])) == ""
    assert text_of(object()) == ""

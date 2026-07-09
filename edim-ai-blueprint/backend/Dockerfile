FROM python:3.12-slim

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# 한글 TTF (견적서 PDF 임베드) — 실패해도 빌드 계속 (CID 폰트 폴백)
RUN mkdir -p /app/fonts && \
    (apt-get update && apt-get install -y --no-install-recommends fonts-nanum && \
     cp /usr/share/fonts/truetype/nanum/NanumGothic.ttf /app/fonts/ && \
     apt-get purge -y fonts-nanum && apt-get autoremove -y && rm -rf /var/lib/apt/lists/*) \
    || echo "font skip — CID fallback"

COPY . .

# generate the built-in sample drawing (sample_data/*.dxf is gitignored)
RUN python scripts/make_sample_dxf.py && mkdir -p uploads

EXPOSE 8000

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]

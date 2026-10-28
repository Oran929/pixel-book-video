.PHONY: install check smoke

install:
	cd tools && uv sync
	cd video && npm install

# 统一检查：任何一步失败，make 立即以非零码退出
check:
	cd tools && uv run pytest
	cd tools && uv run ruff check .
	cd tools && uv run ruff format --check .
	cd video && npm run -s typecheck
	cd video && npm run -s lint
	cd video && npm run -s test

# 冒烟测试：用固定小样例经一键命令真实渲染一次（慢，不放进 check）；假 TTS 和假语音识别，
# 全部在临时目录里进行，检查 MP4 视频流帧数与 timeline.json 的总帧数相差不超过一帧
smoke:
	cd tools && uv run pytest smoke

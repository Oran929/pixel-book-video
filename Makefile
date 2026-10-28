.PHONY: install check

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

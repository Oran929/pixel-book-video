.PHONY: install check

install:
	cd tools && uv sync
	cd video && npm install

# 统一检查：任何一步失败，make 立即以非零码退出
check:
	cd tools && .venv/bin/pytest
	cd tools && .venv/bin/ruff check .
	cd tools && .venv/bin/ruff format --check .
	cd video && npm run -s typecheck
	cd video && npm run -s lint
	cd video && npm run -s test

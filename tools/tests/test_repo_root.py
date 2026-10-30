from pixelbook import REPO_ROOT


def test_repo_root_points_at_repository():
    assert (REPO_ROOT / "pronunciation.yaml").is_file()
    assert (REPO_ROOT / "examples" / "books").is_dir()

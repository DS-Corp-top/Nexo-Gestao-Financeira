def find_react_index(settings):
    for frontend_dist_dir in settings.FRONTEND_DIST_CANDIDATES:
        index_path = frontend_dist_dir / "index.html"
        if index_path.exists():
            return index_path
    return None


def react_build_missing_message(settings):
    candidates = ", ".join(
        str(frontend_dist_dir / "index.html")
        for frontend_dist_dir in settings.FRONTEND_DIST_CANDIDATES
    )
    return (
        "React build not found. Checked: "
        f"{candidates}. Run `npm run build` from the repository root and deploy again."
    )

import { moviesPathForView, type MoviesView } from "../moviesRoutes";

function replaceBrowserPath(pathname: string): void {
  if (typeof window === "undefined") {
    return;
  }

  if (
    window.location.pathname === pathname &&
    window.location.search === "" &&
    window.location.hash === ""
  ) {
    return;
  }

  window.history.replaceState(window.history.state, "", pathname);
}

export function replaceMoviesViewPath(view: MoviesView): void {
  replaceBrowserPath(moviesPathForView(view));
}

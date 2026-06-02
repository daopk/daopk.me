---
title: "Moving Apps Out of the Shell"
date: "2026-06-02"
description: "Why I moved first-party apps out of the shell and into independently published modules under /apps."
---

A short note about another refactor I just finished: moving first-party apps from `src/apps` into `apps/`. The old shape was easy to understand. Every built-in app lived inside the main source tree, and the shell could import it like any other Vue component. That was a good starting point while I was still figuring out what this project wanted to be, because it kept the system small and made the first version easy to wire together.

Over time, though, the apps started to feel too close to the shell. Changing a note app, a photo viewer, or a small experiment could still become a site deploy. The shell bundle had to know too much about app code, and the deploy pipeline treated the whole thing as one unit. For a project that is supposed to feel like a tiny operating system, that started to feel wrong. The OS should be able to boot, list apps, and launch them without carrying every app's implementation in the same release.

There was also a caching problem hiding in there. If one app changed, the safest answer was often to rebuild the main app and let the browser fetch a new shell. That works, but it is not the kind of separation I want. A small app update should not make the desktop, mobile shell, kernel, service worker, and app launcher all feel like part of the same shipment. So I split the track: the shell keeps being the host, and the apps move onto their own release path.

First-party apps now live as workspace packages under `apps/<id>`. Each one builds to a small ES module, with its own package version and its own release-pinned URL. The shell does not bundle those modules in production. Instead, it fetches a same-origin catalog from `/apps/index.json`, registers the apps it finds there, and imports an app only when the user launches it. In development, the setup stays simple: the shell imports the workspace packages directly, so HMR still works.

The important part is that the shell still owns the trusted identity. App names, icons, permissions, categories, window defaults, and shell support stay in the host registry. The catalog only says which published module URL belongs to which known app, which keeps the launcher stable and gives the shell a clear place to reject anything that does not match the expected first-party shape.

The app modules also share the host runtime instead of bringing their own copy of everything. Vue, the kernel SDK, the UI kit, icons, markdown helpers, and content helpers are marked external in each app build. The root build emits those runtime surfaces as dedicated chunks and writes an import map into `index.html`, so a dynamically imported app still uses the same Vue instance and the same injection keys as the shell. In production, app commits trigger an app-only workflow: changed apps are built one by one, uploaded to R2 under immutable URLs, and the catalog is updated. The shell does not deploy just because an app changed.

That is the part I like most. The root app and the apps now have different clocks. The shell can focus on boot, windows, mobile navigation, settings, permissions, and the general feel of the OS, while each app can move at its own pace. If I improve Notes, only Notes needs a new module URL. If I redesign the desktop, the app catalog can stay exactly where it is.

This does not make the project magically simple. There are still contracts to maintain, and runtime composition has sharp edges: shared Vue instances, import maps, release URLs, catalog validation, and fallback behavior all matter. But the boundary is much healthier now. The shell is a host again, not a container accidentally stuffed with every app it can launch. It is a small architectural change, but it makes the project feel closer to the thing it is pretending to be: an operating system on the web, where apps can be shipped without rebuilding the whole machine around them.

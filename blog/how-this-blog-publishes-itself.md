---
title: "How This Blog Publishes Itself"
date: "2026-05-31"
description: "A short note on the refactor that lets me publish a post just by committing a markdown file - no rebuilds, served straight from Cloudflare R2."
---

A short note about a refactor I just finished: how posts on this site get published.

Until now, blog posts were baked into the app at build time. Each post was bundled straight into the JavaScript, so writing a new post - or fixing a single typo - meant rebuilding and redeploying the whole site. For a place I want to write in casually, that friction added up.

So I changed it. A post is now just a markdown file in the repo under `blog/`. When I commit one, a small GitHub Action picks it up, generates a tiny metadata index, prerenders an SEO copy, and uploads everything to a Cloudflare R2 bucket. Publishing a post no longer touches the app deploy at all.

At runtime the blog reads the list of posts and each post's content on demand, from the same origin, and caches them in an in-browser virtual file system. Repeat visits load instantly, and a post you have already opened still works offline.

Crawlers and link previews are not left behind: the Worker serves a fully prerendered HTML version to bots, so the SEO side keeps working even though the app itself loads content dynamically.

The part I like most is the separation. The app and the writing now live on two independent tracks - I can ship code without thinking about posts, and write posts without waiting on a build. Hopefully that nudges me to write here a little more often.

As usual, most of this was vibe-coded with help from Opus.

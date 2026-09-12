const HTML = `<!DOCTYPE html>
<html lang="ja">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Tadoku Tracker</title>
  <script src="https://cdn.jsdelivr.net/npm/alpinejs@3/dist/cdn.min.js" defer></script>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: system-ui, -apple-system, sans-serif; background: #fff; color: #222; min-height: 100vh; font-size: 16px; }

    .page { max-width: 660px; margin: 0 auto; padding: 0 1.5rem; }

    .site-header {
      padding: 2.5rem 0 1.2rem;
      text-align: center;
      border-bottom: 1px solid #eee;
    }
    .site-header h1 { font-size: 1.75rem; font-weight: 600; letter-spacing: -0.01em; }
    .site-header .subtitle {
      margin-top: 0.35rem;
      font-size: 0.75rem;
      color: #bbb;
      letter-spacing: 0.12em;
      text-transform: uppercase;
    }

    .stats {
      display: flex;
      justify-content: center;
      gap: 2rem;
      padding: 0.9rem 0;
      font-size: 0.85rem;
      color: #999;
      border-bottom: 1px solid #eee;
    }
    .stats strong { color: #BC002D; font-weight: 600; }

    .filter-bar {
      display: flex;
      justify-content: center;
      gap: 0.4rem;
      padding: 0.9rem 0;
      border-bottom: 1px solid #eee;
    }
    .filter-bar button {
      padding: 0.3rem 1rem;
      border: 1px solid #ddd;
      border-radius: 99px;
      background: white;
      font-size: 0.82rem;
      cursor: pointer;
      color: #555;
    }
    .filter-bar button.active {
      background: #BC002D;
      color: white;
      border-color: #BC002D;
    }

    .loading { text-align: center; padding: 4rem 0; color: #ccc; font-size: 0.9rem; }

    .story-row {
      display: flex;
      align-items: center;
      gap: 0.75rem;
      padding: 0.8rem 0;
      border-bottom: 1px solid #f2f2f2;
    }
    .story-num {
      font-size: 0.7rem;
      color: #ccc;
      min-width: 1.5rem;
      text-align: right;
      flex-shrink: 0;
    }
    .story-info { flex: 1; min-width: 0; }
    .story-name {
      font-size: 1rem;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .story-pages {
      font-size: 0.72rem;
      color: #bbb;
      margin-top: 0.1rem;
    }
    .story-date {
      font-size: 0.75rem;
      color: #ccc;
      min-width: 5.5rem;
      text-align: right;
      flex-shrink: 0;
    }
    .read-count {
      font-size: 0.78rem;
      font-weight: 600;
      min-width: 1.8rem;
      text-align: center;
      flex-shrink: 0;
    }
    .read-count.zero { color: #ddd; }
    .read-count.some { color: #BC002D; }

    .btn-read {
      font-size: 0.78rem;
      color: #BC002D;
      text-decoration: none;
      border: 1px solid #e8c0c8;
      border-radius: 4px;
      padding: 0.25rem 0.6rem;
      white-space: nowrap;
      flex-shrink: 0;
    }
    .btn-read:hover { background: #fff5f7; }

    .btn-check {
      background: none;
      border: 1.5px solid #e0e0e0;
      border-radius: 50%;
      width: 1.7rem;
      height: 1.7rem;
      font-size: 0.75rem;
      cursor: pointer;
      color: #ccc;
      flex-shrink: 0;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .btn-check.done { border-color: #BC002D; color: #BC002D; }
    .btn-check:active { background: #fff5f7; }

    footer {
      text-align: center;
      padding: 2rem 0;
      font-size: 0.75rem;
      color: #ccc;
      border-top: 1px solid #eee;
      margin-top: 0.5rem;
    }
  </style>
</head>
<body x-data="tracker()" x-init="init()">
  <div class="page">

    <header class="site-header">
      <h1>Tadoku Tracker</h1>
      <p class="subtitle">Level 0 &mdash; 多読</p>
    </header>

    <div class="stats">
      <span>Read <strong x-text="readCount"></strong></span>
      <span>Unread <strong x-text="stories.length - readCount"></strong></span>
      <span>Sessions <strong x-text="totalSessions"></strong></span>
    </div>

    <div class="filter-bar">
      <button :class="filter === 'all' ? 'active' : ''" @click="filter = 'all'">All</button>
      <button :class="filter === 'unread' ? 'active' : ''" @click="filter = 'unread'">Unread</button>
      <button :class="filter === 'suggest' ? 'active' : ''" @click="filter = 'suggest'">Suggest</button>
    </div>

    <div>
      <template x-if="loading">
        <div class="loading">Loading...</div>
      </template>
      <template x-for="s in filtered" :key="s.key">
        <div class="story-row">
          <span class="story-num" x-text="s.num"></span>
          <div class="story-info">
            <div class="story-name" x-text="s.name"></div>
            <div class="story-pages" x-text="s.pages ? s.pages + ' pages' : ''"></div>
          </div>
          <span class="story-date" x-text="s.last_read || '—'"></span>
          <span class="read-count" :class="s.reads > 0 ? 'some' : 'zero'" x-text="s.reads > 0 ? s.reads + '×' : '○'"></span>
          <a class="btn-read" :href="'/pdf/' + encodeURIComponent(s.key)" target="_blank">Read</a>
          <button class="btn-check" :class="s.reads > 0 ? 'done' : ''" @click="markRead(s)">✓</button>
        </div>
      </template>
    </div>

    <footer>多読 Level 0 &mdash; <span x-text="stories.length"></span> stories</footer>

  </div>

  <script>
  function tracker() {
    return {
      stories: [],
      progress: {},
      pages: {},
      filter: 'all',
      loading: true,

      async init() {
        const [storiesRes, progressRes, pagesRes] = await Promise.all([
          fetch('/api/stories'),
          fetch('/api/progress'),
          fetch('/api/pages'),
        ]);
        const keys = await storiesRes.json();
        this.progress = await progressRes.json();
        this.pages = await pagesRes.json();
        this.stories = keys.map(key => this.storyObj(key));
        this.loading = false;
      },

      storyObj(key) {
        const p = this.progress[key] || { reads: 0, last_read: null };
        const name = key.replace(/^\\d+_/, '').replace(/\\.pdf$/, '');
        const num = key.match(/^(\\d+)/)?.[1] || '?';
        const pages = this.pages[key] || null;
        return { key, name, num, pages, reads: p.reads, last_read: p.last_read };
      },

      get filtered() {
        let list = [...this.stories];
        if (this.filter === 'unread') return list.filter(s => s.reads === 0);
        if (this.filter === 'suggest') {
          return list.sort((a, b) => {
            if (!a.last_read && !b.last_read) return 0;
            if (!a.last_read) return -1;
            if (!b.last_read) return 1;
            return a.last_read < b.last_read ? -1 : 1;
          });
        }
        return list;
      },

      get readCount() { return this.stories.filter(s => s.reads > 0).length; },
      get totalSessions() { return this.stories.reduce((sum, s) => sum + s.reads, 0); },

      async markRead(story) {
        const res = await fetch('/api/read', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ key: story.key }),
        });
        const updated = await res.json();
        story.reads = updated.reads;
        story.last_read = updated.last_read;
        this.progress[story.key] = updated;
      },
    };
  }
  </script>
</body>
</html>`;

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    // Serve HTML
    if (url.pathname === '/') {
      return new Response(HTML, {
        headers: { 'Content-Type': 'text/html; charset=utf-8' },
      });
    }

    // List stories from R2
    if (url.pathname === '/api/stories') {
      const list = await env.BUCKET.list();
      const keys = list.objects
        .map(o => o.key)
        .filter(k => k.endsWith('.pdf'))
        .sort();
      return Response.json(keys);
    }

    // Get read progress from KV
    if (url.pathname === '/api/progress') {
      const data = await env.KV.get('progress', 'json') || {};
      return Response.json(data);
    }

    // Get page counts from KV
    if (url.pathname === '/api/pages') {
      const data = await env.KV.get('pages', 'json') || {};
      return Response.json(data);
    }

    // Mark story as read
    if (url.pathname === '/api/read' && request.method === 'POST') {
      const { key } = await request.json();
      const data = await env.KV.get('progress', 'json') || {};
      const today = new Date().toISOString().split('T')[0];
      data[key] = {
        reads: (data[key]?.reads || 0) + 1,
        last_read: today,
      };
      await env.KV.put('progress', JSON.stringify(data));
      return Response.json(data[key]);
    }

    // Serve PDF from R2
    if (url.pathname.startsWith('/pdf/')) {
      const key = decodeURIComponent(url.pathname.slice(5));
      const obj = await env.BUCKET.get(key);
      if (!obj) return new Response('Not found', { status: 404 });
      return new Response(obj.body, {
        headers: {
          'Content-Type': 'application/pdf',
          'Content-Disposition': `inline; filename="${encodeURIComponent(key)}"`,
        },
      });
    }

    return new Response('Not found', { status: 404 });
  },
};

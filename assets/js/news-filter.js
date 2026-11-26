(async () => {
	const params = new URLSearchParams(location.search);
	const category = params.get('category');
	if (!['event', 'region', 'notice'].includes(category)) return;

	const list = document.querySelector('.content .news__list');
	const nav = document.querySelector('.news-subnav');
	const pagination = document.querySelector('.news-pagination');
	if (!list || !nav) return;

	try {
		// Collect every static list page before filtering, including older notices.
		const root = new URL('./', location.href);
		const pending = [new URL('./', root).href];
		const visited = new Set();
		const items = [];
		while (pending.length) {
			const url = pending.shift();
			if (visited.has(url)) continue;
			visited.add(url);
			const response = await fetch(url);
			if (!response.ok) throw new Error('一覧を取得できませんでした');
			const doc = new DOMParser().parseFromString(await response.text(), 'text/html');
			for (const item of doc.querySelectorAll('.content .news__list > li')) {
				for (const link of item.querySelectorAll('a[href]')) {
					link.href = new URL(link.getAttribute('href'), url).href;
				}
				items.push(item);
			}
			for (const link of doc.querySelectorAll('.news-pagination a[href]')) {
				const next = new URL(link.getAttribute('href'), url);
				if (next.origin === root.origin && next.pathname.startsWith(root.pathname)) pending.push(next.href);
			}
		}
		const filtered = items.filter(item => item.querySelector(`.news__cat--${category}`));
		const pageCount = Math.max(1, Math.ceil(filtered.length / 20));
		const page = Math.min(pageCount, Math.max(1, Number.parseInt(params.get('page'), 10) || 1));
		list.replaceChildren(...filtered.slice((page - 1) * 20, page * 20));
		for (const link of nav.querySelectorAll('a')) {
			link.classList.toggle('active', link.dataset.newsCategory === category);
			if (link.dataset.newsCategory === category) link.setAttribute('aria-current', 'true');
			else link.removeAttribute('aria-current');
		}
		if (pagination) {
			pagination.replaceChildren();
			for (let i = 1; i <= pageCount && pageCount > 1; i++) {
				const node = document.createElement(i === page ? 'span' : 'a');
				node.textContent = i;
				if (i === page) node.setAttribute('aria-current', 'page');
				else node.href = `${root.href}?category=${category}&page=${i}`;
				pagination.append(node);
			}
		}
		// Imported event entries also need their ended labels updated.
		const today = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Tokyo' }).format(new Date());
		for (const item of list.querySelectorAll('[data-event-end]')) {
			for (const status of item.querySelectorAll('[data-event-ended]')) status.hidden = item.dataset.eventEnd >= today;
		}
		if (category === 'event') await window.initNewsCalendar();
	} catch (error) {
		const message = document.createElement('p');
		message.className = 'section__text';
		message.setAttribute('role', 'status');
		message.textContent = 'カテゴリ別の表示を読み込めませんでした。すべての記事を表示しています。時間をおいて再度お試しください。';
		nav.after(message);
	}
})();

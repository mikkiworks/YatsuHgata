document.addEventListener('DOMContentLoaded', () => {
	setupMobileMenu();
	loadTodayTides();
});

function setupMobileMenu() {
	const toggleBtn = document.getElementById('js-toggle');
	const sidebar = document.querySelector('.sidebar');
	const nav = document.getElementById('gnavi');
	const sidebarLogo = document.querySelector('.sidebar__logo');
	const mainContainer = document.querySelector('.main-container');

	if (!toggleBtn || !sidebar || !nav) {
		return;
	}

	const mobileQuery = window.matchMedia('(max-width: 1200px)');
	const navLinks = Array.from(nav.querySelectorAll('a[href]'));
	const focusableElements = [toggleBtn, ...navLinks];

	const setBackgroundInert = (isInert) => {
		[sidebarLogo, mainContainer].forEach((element) => {
			if (!element) {
				return;
			}

			element.inert = isInert;

			if (isInert) {
				element.setAttribute('aria-hidden', 'true');
			} else {
				element.removeAttribute('aria-hidden');
			}
		});
	};

	const setNavAvailable = (isAvailable) => {
		nav.inert = !isAvailable;

		if (isAvailable) {
			nav.removeAttribute('aria-hidden');
		} else {
			nav.setAttribute('aria-hidden', 'true');
		}
	};

	const openMenu = () => {
		if (!mobileQuery.matches) {
			return;
		}

		sidebar.classList.add('is-open');
		toggleBtn.setAttribute('aria-expanded', 'true');
		toggleBtn.setAttribute('aria-label', 'メニューを閉じる');
		setNavAvailable(true);
		setBackgroundInert(true);
		document.body.classList.add('menu-open');

		requestAnimationFrame(() => {
			navLinks[0]?.focus();
		});
	};

	const closeMenu = ({ returnFocus = false } = {}) => {
		if (returnFocus || nav.contains(document.activeElement)) {
			toggleBtn.focus();
		}

		sidebar.classList.remove('is-open');
		toggleBtn.setAttribute('aria-expanded', 'false');
		toggleBtn.setAttribute('aria-label', 'メニューを開く');
		setBackgroundInert(false);
		document.body.classList.remove('menu-open');

		if (mobileQuery.matches) {
			setNavAvailable(false);
		} else {
			setNavAvailable(true);
		}
	};

	const syncMenuWithViewport = () => {
		if (mobileQuery.matches) {
			closeMenu({ returnFocus: nav.contains(document.activeElement) });
		} else {
			sidebar.classList.remove('is-open');
			toggleBtn.setAttribute('aria-expanded', 'false');
			toggleBtn.setAttribute('aria-label', 'メニューを開く');
			setNavAvailable(true);
			setBackgroundInert(false);
			document.body.classList.remove('menu-open');
		}
	};

	toggleBtn.addEventListener('click', () => {
		if (sidebar.classList.contains('is-open')) {
			closeMenu({ returnFocus: true });
		} else {
			openMenu();
		}
	});

	navLinks.forEach((link) => {
		link.addEventListener('click', () => closeMenu());
	});

	document.addEventListener('keydown', (event) => {
		if (!mobileQuery.matches || !sidebar.classList.contains('is-open')) {
			return;
		}

		if (event.key === 'Escape') {
			event.preventDefault();
			closeMenu({ returnFocus: true });
			return;
		}

		if (event.key !== 'Tab') {
			return;
		}

		const firstElement = focusableElements[0];
		const lastElement = focusableElements.at(-1);

		if (event.shiftKey && document.activeElement === firstElement) {
			event.preventDefault();
			lastElement.focus();
		} else if (!event.shiftKey && document.activeElement === lastElement) {
			event.preventDefault();
			firstElement.focus();
		} else if (!focusableElements.includes(document.activeElement)) {
			event.preventDefault();
			firstElement.focus();
		}
	});

	if (typeof mobileQuery.addEventListener === 'function') {
		mobileQuery.addEventListener('change', syncMenuWithViewport);
	} else {
		mobileQuery.addListener(syncMenuWithViewport);
	}

	syncMenuWithViewport();
}

async function loadTodayTides() {
	const dateElements = document.querySelectorAll('[data-tide-date]');

	if (!dateElements.length) {
		return;
	}

	const today = getJapanDateParts();
	const title = `今日(${Number(today.month)}月${Number(today.day)}日)の満干時間`;
	setText('[data-tide-date]', title);

	try {
		const dataUrl = getTideDataUrl(today.year);
		const response = await fetch(dataUrl, { cache: 'no-cache' });

		if (!response.ok) {
			throw new Error(`潮位データの取得に失敗しました (${response.status})`);
		}

		const tideData = await response.json();
		const dayData = tideData.days?.[today.key];

		if (!dayData) {
			throw new Error(`${today.key}の潮位データがありません`);
		}

		setText('[data-tide-high]', `満潮　${formatTideTimes(dayData.high)}`);
		setText('[data-tide-low]', `干潮　${formatTideTimes(dayData.low)}`);
	} catch (error) {
		console.warn(error);
		setText('[data-tide-high]', '満潮　取得できません');
		setText('[data-tide-low]', '干潮　取得できません');
	}
}

function getTideDataUrl(year) {
	const mainScript = Array.from(document.scripts ?? []).find((script) => (
		/\/assets\/js\/main\.js(?:[?#]|$)/.test(script.src)
	));

	if (mainScript) {
		return new URL(`../data/tides/${year}.json`, mainScript.src);
	}

	return new URL(`assets/data/tides/${year}.json`, document.baseURI);
}

function getJapanDateParts(date = new Date()) {
	const parts = new Intl.DateTimeFormat('en-CA', {
		timeZone: 'Asia/Tokyo',
		year: 'numeric',
		month: '2-digit',
		day: '2-digit'
	}).formatToParts(date);
	const values = Object.fromEntries(parts.map(({ type, value }) => [type, value]));

	return {
		year: values.year,
		month: values.month,
		day: values.day,
		key: `${values.year}-${values.month}-${values.day}`
	};
}

function formatTideTimes(events = []) {
	if (!events.length) {
		return '該当なし';
	}

	return events.map(({ time }) => time).join('／');
}

function setText(selector, text) {
	document.querySelectorAll(selector).forEach((element) => {
		element.textContent = text;
	});
}

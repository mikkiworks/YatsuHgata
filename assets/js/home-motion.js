// トップページだけの控えめな表示アニメーション。
(() => {
	const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
	if (motion.matches || !Element.prototype.animate || !('IntersectionObserver' in window)) return;

	const animations = new Map();
	let observer;
	const show = (element) => {
		const animation = animations.get(element);
		if (!animation) return;
		animation.cancel();
		animations.delete(element);
		observer?.unobserve(element);
	};
	const revealAll = () => {
		observer?.disconnect();
		for (const element of animations.keys()) show(element);
	};
	const animate = (element, distance, duration, paused = false) => {
		const animation = element.animate([
			{ opacity: 0, translate: `0 ${distance}px` },
			{ opacity: 1, translate: '0 0' }
		], { duration, easing: 'ease-out', fill: 'both' });
		animations.set(element, animation);
		animation.onfinish = () => show(element);
		if (paused) animation.pause();
	};

	try {
		observer = new IntersectionObserver((entries) => {
			for (const entry of entries) {
				if (!entry.isIntersecting) continue;
				animations.get(entry.target)?.play();
				observer.unobserve(entry.target);
			}
		}, { threshold: 0 });

		document.querySelectorAll('.topvisual__photo, .topvisual__title').forEach((element) => {
			animate(element, 6, 800);
		});
		document.querySelectorAll('main > .topblock, main > .partner').forEach((element) => {
			// 途中位置から開いた場合、通過済みの内容は隠さない。
			const bounds = element.getBoundingClientRect();
			if (bounds.bottom <= 0) return;
			const belowViewport = bounds.top >= window.innerHeight;
			animate(element, 8, 400, belowViewport);
			if (belowViewport) observer.observe(element);
		});
		document.addEventListener('focusin', (event) => {
			for (const element of animations.keys()) {
				if (element.contains(event.target)) show(element);
			}
		});
		const onPreferenceChange = () => { if (motion.matches) revealAll(); };
		if (motion.addEventListener) motion.addEventListener('change', onPreferenceChange);
		else motion.addListener(onPreferenceChange);
		window.addEventListener('beforeprint', revealAll);
		window.addEventListener('pagehide', revealAll);
	} catch (error) {
		// 非対応環境でも内容を表示したままにする。
		revealAll();
	}
})();

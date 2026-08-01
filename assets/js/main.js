document.addEventListener('DOMContentLoaded', () => {
	const toggleBtn = document.getElementById('js-toggle');
	const sidebar = document.querySelector('.sidebar');

	if (toggleBtn && sidebar) {
		toggleBtn.addEventListener('click', () => {
			const isOpen = sidebar.classList.toggle('is-open');
			toggleBtn.setAttribute('aria-expanded', String(isOpen));
		});
	}
});

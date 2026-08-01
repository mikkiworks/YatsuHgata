document.addEventListener('DOMContentLoaded', () => {
	const toggleBtn = document.getElementById('js-toggle');
	const sidebar = document.querySelector('.sidebar');

	if (toggleBtn && sidebar) {
		toggleBtn.addEventListener('click', () => {
			sidebar.classList.toggle('is-open');
		});
	}
});

const expanded = sidebar.classList.toggle('is-open');
toggleBtn.setAttribute('aria-expanded', String(expanded));
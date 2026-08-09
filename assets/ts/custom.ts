const SEARCH_FOCUS_KEY = 'stack-focus-search';
const SEARCH_PATH = '/page/search/';

function focusSearchInput(): void {
    const input = document.querySelector<HTMLInputElement>('.search-form input');
    if (input) {
        input.focus();
        input.select();
    }
}

function setupGlobalSearchShortcut(): void {
    window.addEventListener('keydown', (event) => {
        if (!(event.metaKey || event.ctrlKey) || event.key.toLowerCase() !== 'k') return;

        event.preventDefault();

        if (document.querySelector<HTMLInputElement>('.search-form input')) {
            focusSearchInput();
            return;
        }

        sessionStorage.setItem(SEARCH_FOCUS_KEY, '1');
        window.location.assign(SEARCH_PATH);
    });

    if (sessionStorage.getItem(SEARCH_FOCUS_KEY) === '1') {
        sessionStorage.removeItem(SEARCH_FOCUS_KEY);
        window.requestAnimationFrame(focusSearchInput);
    }
}

function setupReadingProgress(): void {
    const article = document.querySelector<HTMLElement>('.main-article');
    const content = article?.querySelector<HTMLElement>('.article-content');
    if (!article || !content) return;

    const progressBar = document.createElement('div');
    progressBar.className = 'article-reading-progress';
    progressBar.setAttribute('aria-hidden', 'true');
    document.body.appendChild(progressBar);

    let start = 0;
    let end = 0;

    const measure = (): void => {
        start = article.getBoundingClientRect().top + window.scrollY;
        end = content.getBoundingClientRect().bottom + window.scrollY;
        update();
    };

    const update = (): void => {
        const range = Math.max(end - start - window.innerHeight, 1);
        const progress = Math.min(Math.max((window.scrollY - start) / range, 0), 1);
        progressBar.style.transform = `scaleX(${progress})`;
    };

    window.addEventListener('scroll', update, { passive: true });
    window.addEventListener('resize', measure);
    measure();

    if ('ResizeObserver' in window) {
        new ResizeObserver(measure).observe(content);
    }
}

window.addEventListener('load', () => {
    setupGlobalSearchShortcut();
    setupReadingProgress();
});

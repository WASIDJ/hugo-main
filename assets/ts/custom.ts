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

function setupTocAutoCollapse(): void {
    const toc = document.querySelector<HTMLElement>('.widget--toc #TableOfContents');
    if (!toc) return;

    const nestedLists = Array.from(
        toc.querySelectorAll<HTMLElement>('li > ul, li > ol')
    );
    const nestedListSet = new Set(nestedLists);

    const updateExpandedBranch = (): void => {
        const expandedLists = new Set<HTMLElement>();

        const activeItem = toc.querySelector<HTMLLIElement>('li.active-class');
        if (activeItem) {
            Array.from(activeItem.children).forEach((child) => {
                if (child instanceof HTMLElement && nestedListSet.has(child)) {
                    expandedLists.add(child);
                }
            });

            let parentList = activeItem.parentElement;
            while (parentList && parentList !== toc) {
                if (nestedListSet.has(parentList)) {
                    expandedLists.add(parentList);
                }

                const parentItem = parentList.parentElement;
                if (!parentItem || parentItem === toc) break;
                parentList = parentItem.parentElement;
            }
        }

        nestedLists.forEach((list) => {
            list.classList.toggle('toc-branch-open', expandedLists.has(list));
        });
    };

    const observer = new MutationObserver((mutations) => {
        if (mutations.some((mutation) => mutation.attributeName === 'class')) {
            updateExpandedBranch();
        }
    });

    observer.observe(toc, {
        subtree: true,
        attributes: true,
        attributeFilter: ['class']
    });

    updateExpandedBranch();
}

function setupBackToTop(): void {
    if (!document.querySelector('.main-article')) return;

    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'back-to-top';
    button.setAttribute('aria-label', '返回顶部');
    button.setAttribute('title', '返回顶部');
    button.innerHTML = `
        <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M12 19V5m0 0-6 6m6-6 6 6" />
        </svg>
    `;

    const updateVisibility = (): void => {
        button.classList.toggle('is-visible', window.scrollY > Math.min(window.innerHeight * 0.75, 600));
    };

    button.addEventListener('click', () => {
        const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        window.scrollTo({
            top: 0,
            behavior: reduceMotion ? 'auto' : 'smooth'
        });
    });

    window.addEventListener('scroll', updateVisibility, { passive: true });
    document.body.appendChild(button);
    updateVisibility();
}

window.addEventListener('load', () => {
    setupGlobalSearchShortcut();
    setupTocAutoCollapse();
    setupReadingProgress();
    setupBackToTop();
});

const SEARCH_FOCUS_KEY = 'stack-focus-search';
const SEARCH_PATH = '/page/search/';

interface ArticleStatsResponse {
    views: number;
    completions: number;
}

function setupArticleStats(): () => void {
    const endpoint = document.querySelector<HTMLMetaElement>(
        'meta[name="article-stats-endpoint"]'
    )?.content;
    const blocks = Array.from(
        document.querySelectorAll<HTMLElement>('[data-article-stats][data-article-path]')
    ).flatMap((element) => {
        const path = element.dataset.articlePath;
        const views = element.querySelector<HTMLElement>('[data-article-stat="views"]');
        const completions = element.querySelector<HTMLElement>('[data-article-stat="completions"]');
        return path && views && completions ? [{ element, path, views, completions }] : [];
    });
    if (!endpoint || blocks.length === 0) return () => undefined;

    const currentPath = window.location.pathname.endsWith('/')
        ? window.location.pathname
        : `${window.location.pathname}/`;
    const articleBlock = document.querySelector('.main-article')
        ? blocks.find((block) => block.path === currentPath)
        : undefined;
    const localPreview = ['localhost', '127.0.0.1'].includes(window.location.hostname);

    const render = (path: string, stats: ArticleStatsResponse): void => {
        blocks.filter((block) => block.path === path).forEach((block) => {
            block.views.textContent = String(stats.views);
            block.completions.textContent = String(stats.completions);
        });
    };

    const request = async (path: string, event?: 'view' | 'complete'): Promise<boolean> => {
        try {
            const response = await fetch(
                event ? endpoint : `${endpoint}?path=${encodeURIComponent(path)}`,
                event
                    ? {
                        method: 'POST',
                        credentials: 'include',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ path, event })
                    }
                    : { credentials: 'include' }
            );
            if (!response.ok) return false;
            render(path, await response.json() as ArticleStatsResponse);
            return true;
        } catch {
            return false;
        }
    };

    if (!articleBlock) {
        const uniquePaths = [...new Set(blocks.map((block) => block.path))];
        uniquePaths.forEach((path) => void request(path));
        return () => undefined;
    }

    const viewSessionKey = `article-view:${articleBlock.path}`;
    const completeSessionKey = `article-complete:${articleBlock.path}`;

    if (localPreview || sessionStorage.getItem(viewSessionKey) === '1') {
        void request(articleBlock.path);
    } else {
        void request(articleBlock.path, 'view').then((recorded) => {
            if (recorded) sessionStorage.setItem(viewSessionKey, '1');
        });
    }

    let completionPending = false;
    return (): void => {
        if (
            localPreview ||
            completionPending ||
            sessionStorage.getItem(completeSessionKey) === '1'
        ) return;

        completionPending = true;
        void request(articleBlock.path, 'complete').then((recorded) => {
            completionPending = false;
            if (recorded) sessionStorage.setItem(completeSessionKey, '1');
        });
    };
}

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

function setupReadingProgress(onReadingComplete: () => void): void {
    const article = document.querySelector<HTMLElement>('.main-article');
    const content = article?.querySelector<HTMLElement>('.article-content');
    if (!article || !content) return;

    const progressBar = document.createElement('div');
    progressBar.className = 'article-reading-progress';
    progressBar.setAttribute('role', 'navigation');
    progressBar.setAttribute('aria-label', '文章阅读进度');

    const progressFill = document.createElement('div');
    progressFill.className = 'article-reading-progress__fill';
    progressFill.setAttribute('aria-hidden', 'true');
    progressBar.appendChild(progressFill);

    const toc = document.querySelector<HTMLElement>('.widget--toc #TableOfContents');
    const tocLinks = toc
        ? Array.from(toc.querySelectorAll<HTMLAnchorElement>('a[href^="#"]'))
        : [];

    const chapters = tocLinks.flatMap((link) => {
        const targetId = decodeURIComponent((link.getAttribute('href') ?? '').slice(1));
        const heading = document.getElementById(targetId);
        if (!heading) return [];

        let depth = 0;
        let parent: HTMLElement | null = link.parentElement;
        while (parent && parent !== toc) {
            if (parent.tagName === 'LI') depth += 1;
            parent = parent.parentElement;
        }

        return [{
            heading,
            title: link.textContent?.trim() || heading.textContent?.trim() || '文章章节',
            depth: Math.max(depth, 1)
        }];
    });

    const visibleChapters = chapters.length > 32
        ? chapters.filter((chapter) => chapter.depth === 1)
        : chapters;

    const chapterLabel = document.createElement('div');
    chapterLabel.className = 'article-reading-progress__chapter';
    chapterLabel.setAttribute('role', 'status');
    chapterLabel.setAttribute('aria-live', 'polite');
    chapterLabel.setAttribute('aria-atomic', 'true');
    chapterLabel.setAttribute('aria-hidden', 'true');
    chapterLabel.innerHTML = `
        <span class="article-reading-progress__chapter-connector" aria-hidden="true"></span>
        <span class="article-reading-progress__chapter-text"></span>
    `;
    const chapterLabelText = chapterLabel.querySelector<HTMLElement>(
        '.article-reading-progress__chapter-text'
    );
    progressBar.appendChild(chapterLabel);

    const markers = visibleChapters.map((chapter) => {
        const marker = document.createElement('button');
        marker.type = 'button';
        marker.className = 'article-reading-progress__marker';
        marker.dataset.depth = String(Math.min(chapter.depth, 3));
        marker.setAttribute('aria-label', `跳转到：${chapter.title}`);
        marker.addEventListener('click', () => {
            const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
            chapter.heading.scrollIntoView({
                behavior: reduceMotion ? 'auto' : 'smooth',
                block: 'start'
            });
        });
        progressBar.appendChild(marker);

        return { ...chapter, marker, top: 0, position: 0 };
    });

    document.body.appendChild(progressBar);

    let start = 0;
    let end = 0;
    let celebrationShown = false;
    let progressHideTimer = 0;
    let progressPointerInside = false;

    const showProgress = (): void => {
        window.clearTimeout(progressHideTimer);
        progressBar.classList.add('is-visible');
    };

    const scheduleProgressHide = (delay = 700): void => {
        window.clearTimeout(progressHideTimer);
        progressHideTimer = window.setTimeout(() => {
            if (!progressPointerInside && !progressBar.contains(document.activeElement)) {
                progressBar.classList.remove('is-visible');
            }
        }, delay);
    };

    progressBar.addEventListener('pointerenter', () => {
        progressPointerInside = true;
        showProgress();
    });
    progressBar.addEventListener('pointerleave', () => {
        progressPointerInside = false;
        scheduleProgressHide(300);
    });
    progressBar.addEventListener('pointerdown', showProgress);
    progressBar.addEventListener('focusin', showProgress);
    progressBar.addEventListener('focusout', () => scheduleProgressHide(300));

    const showReadingCelebration = (): void => {
        if (celebrationShown) return;
        celebrationShown = true;
        onReadingComplete();

        const celebration = document.createElement('aside');
        celebration.className = 'article-reading-celebration';
        celebration.setAttribute('role', 'status');
        celebration.setAttribute('aria-live', 'polite');
        celebration.setAttribute('aria-atomic', 'true');
        celebration.innerHTML = `
            <span class="article-reading-celebration__burst" aria-hidden="true">
                ${'<i></i>'.repeat(10)}
            </span>
            <span class="article-reading-celebration__icon" aria-hidden="true">
                <svg viewBox="0 0 24 24">
                    <path d="m7.5 12.5 3 3 6-7" />
                    <circle cx="12" cy="12" r="9" />
                </svg>
            </span>
            <span class="article-reading-celebration__copy">
                <strong>阅读完成</strong>
                <span>感谢你读到这里，愿这篇文章带给你一点收获。</span>
            </span>
        `;
        document.body.appendChild(celebration);

        window.requestAnimationFrame(() => celebration.classList.add('is-visible'));
        window.setTimeout(() => {
            celebration.classList.remove('is-visible');
            celebration.classList.add('is-leaving');
            window.setTimeout(() => celebration.remove(), 400);
        }, 5000);
    };

    const measure = (): void => {
        start = article.getBoundingClientRect().top + window.scrollY;
        end = content.getBoundingClientRect().bottom + window.scrollY;

        const range = Math.max(end - start - window.innerHeight, 1);
        markers.forEach((chapter) => {
            chapter.top = chapter.heading.getBoundingClientRect().top + window.scrollY;
            const position = Math.min(Math.max((chapter.top - start) / range, 0), 1);
            chapter.position = position;
            chapter.marker.style.left = `clamp(0.55rem, ${position * 100}%, calc(100% - 0.55rem))`;
        });

        update();
    };

    const updateChapterLabel = (chapterIndex: number, preview = false): void => {
        const chapter = markers[chapterIndex];
        if (!chapter || !chapterLabelText) {
            chapterLabel.classList.remove('is-visible');
            return;
        }

        chapterLabel.setAttribute('aria-hidden', 'false');
        chapterLabelText.textContent = chapter.title;
        chapterLabel.classList.add('is-visible');
        chapterLabel.classList.toggle('is-preview', preview);

        window.requestAnimationFrame(() => {
            const halfWidth = chapterLabel.getBoundingClientRect().width / 2;
            const edgeGap = 8;
            const markerRect = chapter.marker.getBoundingClientRect();
            const desiredPosition = markerRect.left + markerRect.width / 2;
            const safePosition = Math.min(
                Math.max(desiredPosition, halfWidth + edgeGap),
                window.innerWidth - halfWidth - edgeGap
            );
            chapterLabel.style.left = `${safePosition}px`;
            chapterLabel.style.setProperty(
                '--chapter-anchor-offset',
                `${desiredPosition - safePosition}px`
            );
        });
    };

    const clearChapterPreview = (): void => {
        markers.forEach((chapter) => chapter.marker.classList.remove('is-preview'));
        chapterLabel.classList.remove('is-visible', 'is-preview');
        chapterLabel.setAttribute('aria-hidden', 'true');
    };

    markers.forEach((chapter, index) => {
        const showPreview = (): void => {
            markers.forEach((item, itemIndex) => {
                item.marker.classList.toggle('is-preview', itemIndex === index);
            });
            updateChapterLabel(index, true);
        };

        chapter.marker.addEventListener('pointerenter', showPreview);
        chapter.marker.addEventListener('pointerleave', () => {
            if (document.activeElement !== chapter.marker) clearChapterPreview();
        });
        chapter.marker.addEventListener('focus', showPreview);
        chapter.marker.addEventListener('blur', clearChapterPreview);
        chapter.marker.addEventListener('click', () => {
            const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
            let fallbackTimer = 0;
            const finishJump = (): void => {
                window.clearTimeout(fallbackTimer);
                window.removeEventListener('scrollend', finishJump);
                chapter.marker.blur();
                clearChapterPreview();
            };

            if (reduceMotion) {
                finishJump();
                return;
            }

            window.addEventListener('scrollend', finishJump, { once: true });
            fallbackTimer = window.setTimeout(finishJump, 900);
        });
    });

    const update = (): void => {
        const range = Math.max(end - start - window.innerHeight, 1);
        const progress = Math.min(Math.max((window.scrollY - start) / range, 0), 1);
        progressFill.style.transform = `scaleX(${progress})`;

        if (progress >= 0.98 && window.scrollY + window.innerHeight >= end - 8) {
            showReadingCelebration();
        }

        let activeChapter = -1;
        markers.forEach((chapter, index) => {
            const activationOffset = Number.parseFloat(
                window.getComputedStyle(chapter.heading).scrollMarginTop
            ) || 24;
            if (window.scrollY >= chapter.top - activationOffset - 1) activeChapter = index;
        });
        if (window.scrollY >= end - window.innerHeight - 1 && markers.length > 0) {
            activeChapter = markers.length - 1;
        }
        markers.forEach((chapter, index) => {
            chapter.marker.classList.toggle('is-active', index === activeChapter);
            chapter.marker.classList.toggle('is-read', index < activeChapter);
        });
    };

    window.addEventListener('scroll', () => {
        update();
        showProgress();
        scheduleProgressHide();
    }, { passive: true });
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

function setupArticleFocusMode(): void {
    if (!document.body.classList.contains('article-page')) return;

    const sidebar = document.querySelector<HTMLElement>('.left-sidebar');
    if (!sidebar) return;

    const hoverZone = document.createElement('div');
    hoverZone.className = 'reading-sidebar-hover-zone';
    hoverZone.setAttribute('aria-hidden', 'true');

    let closeTimer = 0;

    const cancelClose = (): void => {
        window.clearTimeout(closeTimer);
    };

    const setSidebarOpen = (open: boolean): void => {
        document.body.classList.toggle('reading-sidebar-open', open);
        sidebar.inert = !open;
        sidebar.setAttribute('aria-hidden', String(!open));
    };

    const scheduleClose = (): void => {
        cancelClose();
        closeTimer = window.setTimeout(() => setSidebarOpen(false), 180);
    };

    hoverZone.addEventListener('pointerenter', () => {
        cancelClose();
        setSidebarOpen(true);
    });
    hoverZone.addEventListener('pointerdown', () => setSidebarOpen(true));
    sidebar.addEventListener('pointerenter', cancelClose);
    sidebar.addEventListener('pointerleave', scheduleClose);
    sidebar.addEventListener('focusin', () => {
        cancelClose();
        setSidebarOpen(true);
    });
    sidebar.addEventListener('focusout', (event) => {
        if (!(event.relatedTarget instanceof Node) || !sidebar.contains(event.relatedTarget)) {
            scheduleClose();
        }
    });

    document.addEventListener('pointerdown', (event) => {
        const target = event.target;
        if (
            document.body.classList.contains('reading-sidebar-open') &&
            target instanceof Node &&
            !sidebar.contains(target) &&
            !hoverZone.contains(target)
        ) {
            setSidebarOpen(false);
        }
    });

    window.addEventListener('keydown', (event) => {
        if (event.key === 'Escape' && document.body.classList.contains('reading-sidebar-open')) {
            setSidebarOpen(false);
        }
    });

    document.body.appendChild(hoverZone);
    setSidebarOpen(false);
}

window.addEventListener('load', () => {
    setupGlobalSearchShortcut();
    setupTocAutoCollapse();
    setupReadingProgress(setupArticleStats());
    setupBackToTop();
    setupArticleFocusMode();
});

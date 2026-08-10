const SEARCH_FOCUS_KEY = 'stack-focus-search';
const SEARCH_PATH = '/page/search/';

type RoughAnnotationType =
    | 'underline'
    | 'box'
    | 'circle'
    | 'highlight'
    | 'strike-through'
    | 'crossed-off'
    | 'bracket';

interface RoughAnnotationConfig {
    type: RoughAnnotationType;
    animate?: boolean;
    animationDuration?: number;
    color?: string;
    strokeWidth?: number;
    padding?: number | number[];
    multiline?: boolean;
    iterations?: number;
    brackets?: string | string[];
}

interface RoughAnnotation {
    show(): void;
    hide(): void;
    remove(): void;
}

interface RoughNotationAPI {
    annotate(element: HTMLElement, config: RoughAnnotationConfig): RoughAnnotation;
}

interface Window {
    RoughNotation?: RoughNotationAPI;
}

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

interface ArticleSidenote {
    reference: HTMLAnchorElement;
    source: HTMLElement;
    note: HTMLElement;
    connector: SVGGElement;
}

function cloneFootnoteContent(source: HTMLElement): HTMLElement {
    const clone = source.cloneNode(true) as HTMLElement;
    clone.removeAttribute('id');
    clone.querySelectorAll<HTMLElement>('[id]').forEach((element) => element.removeAttribute('id'));
    clone.querySelectorAll<HTMLElement>('.footnote-backref').forEach((element) => element.remove());

    const content = document.createElement('div');
    content.className = 'article-sidenote__content';
    while (clone.firstChild) content.appendChild(clone.firstChild);
    return content;
}

function setupArticleSidenotes(): void {
    if (!document.documentElement.classList.contains('article-focus-mode')) return;

    const content = document.querySelector<HTMLElement>('.main-article .article-content');
    const container = document.querySelector<HTMLElement>('.main-container');
    const main = container?.querySelector<HTMLElement>('main.main');
    if (!content || !container || !main) return;

    const references = Array.from(
        content.querySelectorAll<HTMLAnchorElement>('a.footnote-ref[href^="#"]')
    );
    if (references.length === 0) return;

    const rail = document.createElement('aside');
    rail.className = 'article-sidenotes';
    rail.setAttribute('aria-label', '文章边注');
    rail.innerHTML = '<div class="article-sidenotes__title" aria-hidden="true">NOTES</div>';

    const connectorLayer = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    connectorLayer.classList.add('article-sidenote-connectors');
    connectorLayer.setAttribute('aria-hidden', 'true');

    const notes = references.flatMap((reference, index): ArticleSidenote[] => {
        const href = reference.getAttribute('href');
        if (!href) return [];

        let targetId = href.slice(1);
        try {
            targetId = decodeURIComponent(targetId);
        } catch {
            // Keep Goldmark's original ID when it is not URI encoded.
        }

        const source = document.getElementById(targetId);
        if (!source) return [];

        const number = reference.textContent?.trim() || String(index + 1);
        const note = document.createElement('section');
        note.className = 'article-sidenote';
        note.id = `sidenote-${index + 1}`;
        note.setAttribute('role', 'note');
        note.innerHTML = `
            <a class="article-sidenote__number" href="#${reference.parentElement?.id || ''}"
               aria-label="返回正文脚注 ${number}">${number}</a>
        `;
        const noteContent = cloneFootnoteContent(source);
        noteContent.id = `sidenote-content-${index + 1}`;
        note.appendChild(noteContent);
        rail.appendChild(note);

        const connector = document.createElementNS('http://www.w3.org/2000/svg', 'g');
        connector.classList.add('article-sidenote-connector');
        connector.dataset.sidenote = String(index + 1);
        connector.append(
            document.createElementNS('http://www.w3.org/2000/svg', 'path'),
            document.createElementNS('http://www.w3.org/2000/svg', 'path')
        );
        connectorLayer.appendChild(connector);

        reference.parentElement?.classList.add('has-article-sidenote');
        reference.setAttribute('aria-describedby', noteContent.id);
        return [{ reference, source, note, connector }];
    });

    if (notes.length === 0) return;

    container.insertBefore(rail, main);
    container.appendChild(connectorLayer);
    document.documentElement.classList.add('article-sidenotes-enhanced');

    const wideLayout = window.matchMedia('(min-width: 1440px)');
    const popoverLayout = window.matchMedia('(max-width: 1439.98px)');
    const hoverInteraction = window.matchMedia('(hover: hover) and (pointer: fine)');
    const popover = document.createElement('aside');
    popover.className = 'article-footnote-popover';
    popover.setAttribute('role', 'note');
    popover.setAttribute('aria-label', '脚注预览');
    popover.setAttribute('aria-live', 'polite');
    popover.setAttribute('aria-hidden', 'true');
    document.body.appendChild(popover);

    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const roughAnnotations = new Map<
        HTMLAnchorElement,
        { reference: RoughAnnotation; note: RoughAnnotation }
    >();
    if (window.RoughNotation) {
        notes.forEach(({ reference, note }) => {
            roughAnnotations.set(reference, {
                reference: window.RoughNotation!.annotate(reference, {
                    type: 'circle',
                    animate: !reduceMotion,
                    animationDuration: 360,
                    color: 'var(--accent-color)',
                    strokeWidth: 1.5,
                    padding: 2,
                    iterations: 2
                }),
                note: window.RoughNotation!.annotate(note, {
                    type: 'bracket',
                    brackets: 'right',
                    animate: !reduceMotion,
                    animationDuration: 420,
                    color: 'var(--accent-color)',
                    strokeWidth: 1.5,
                    padding: 4,
                    iterations: 2
                })
            });
        });
    }

    let closeTimer = 0;
    let layoutFrame = 0;

    const clearCloseTimer = (): void => window.clearTimeout(closeTimer);

    const setActive = (item: ArticleSidenote | null): void => {
        notes.forEach(({ reference, note, connector }) => {
            const active = item?.reference === reference;
            reference.classList.toggle('is-sidenote-active', active);
            note.classList.toggle('is-active', active);
            connector.classList.toggle('is-active', active);

            const annotations = roughAnnotations.get(reference);
            if (!annotations) return;
            annotations.reference.hide();
            annotations.note.hide();
            if (active) {
                window.requestAnimationFrame(() => {
                    annotations.reference.show();
                    if (wideLayout.matches) annotations.note.show();
                });
            }
        });
    };

    const hidePopover = (): void => {
        clearCloseTimer();
        popover.classList.remove('is-visible');
        popover.setAttribute('aria-hidden', 'true');
        if (!wideLayout.matches) setActive(null);
    };

    const schedulePopoverClose = (): void => {
        clearCloseTimer();
        closeTimer = window.setTimeout(hidePopover, 140);
    };

    const positionPopover = (reference: HTMLAnchorElement): void => {
        const referenceRect = reference.getBoundingClientRect();
        const popoverRect = popover.getBoundingClientRect();
        const edgeGap = 12;
        const centeredLeft = referenceRect.left + referenceRect.width / 2 - popoverRect.width / 2;
        const left = Math.min(
            Math.max(centeredLeft, edgeGap),
            window.innerWidth - popoverRect.width - edgeGap
        );
        const above = referenceRect.top - popoverRect.height - 12;
        const preferredTop = above >= edgeGap ? above : referenceRect.bottom + 12;
        const top = Math.min(
            Math.max(preferredTop, edgeGap),
            window.innerHeight - popoverRect.height - edgeGap
        );

        popover.style.left = `${left}px`;
        popover.style.top = `${top}px`;
        popover.dataset.placement = above >= edgeGap ? 'top' : 'bottom';
    };

    const showPopover = (item: ArticleSidenote): void => {
        if (!popoverLayout.matches) return;
        clearCloseTimer();
        setActive(item);
        popover.replaceChildren(cloneFootnoteContent(item.source));
        popover.setAttribute('aria-hidden', 'false');
        popover.classList.add('is-visible');
        positionPopover(item.reference);
    };

    const layoutSidenotes = (): void => {
        window.cancelAnimationFrame(layoutFrame);
        layoutFrame = window.requestAnimationFrame(() => {
            if (!wideLayout.matches) return;

            const railTop = rail.getBoundingClientRect().top + window.scrollY;
            let nextTop = 4.6 * parseFloat(getComputedStyle(document.documentElement).fontSize);

            notes.forEach(({ reference, note }) => {
                const referenceTop = reference.getBoundingClientRect().top + window.scrollY;
                const desiredTop = referenceTop - railTop - 8;
                const top = Math.max(desiredTop, nextTop);
                note.style.top = `${top}px`;
                nextTop = top + note.offsetHeight + 14;
            });

            const canvasRect = container.getBoundingClientRect();
            connectorLayer.setAttribute('viewBox', `0 0 ${canvasRect.width} ${canvasRect.height}`);
            connectorLayer.setAttribute('width', String(canvasRect.width));
            connectorLayer.setAttribute('height', String(canvasRect.height));

            notes.forEach(({ reference, note, connector }, index) => {
                const referenceRect = reference.getBoundingClientRect();
                const noteRect = note.getBoundingClientRect();
                const referenceX = referenceRect.left + referenceRect.width / 2 - canvasRect.left;
                const referenceY = referenceRect.top + referenceRect.height / 2 - canvasRect.top;
                const noteX = noteRect.right - canvasRect.left;
                const noteY = noteRect.top + Math.min(noteRect.height / 2, 24) - canvasRect.top;
                const bendX = noteX + Math.max((referenceX - noteX) * 0.52, 32);
                const paths = Array.from(connector.querySelectorAll<SVGPathElement>('path'));
                const jitter = index % 2 === 0 ? 1.6 : -1.6;
                const pathData = [
                    `M ${referenceX} ${referenceY} C ${referenceX - 34} ${referenceY + jitter}, ${bendX} ${noteY - jitter}, ${noteX} ${noteY}`,
                    `M ${referenceX + 1.5} ${referenceY + 2} C ${referenceX - 29} ${referenceY - jitter}, ${bendX + 3} ${noteY + jitter}, ${noteX} ${noteY + 2}`
                ];

                paths.forEach((path, pathIndex) => {
                    path.setAttribute('d', pathData[pathIndex]);
                    const length = Math.max(path.getTotalLength(), 1);
                    path.style.setProperty('--connector-length', String(length));
                });
                if (referenceRect.bottom >= 0 && referenceRect.top <= window.innerHeight) {
                    connector.classList.add('is-drawn');
                }
            });
        });
    };

    if ('IntersectionObserver' in window) {
        const connectorObserver = new IntersectionObserver((entries) => {
            if (!wideLayout.matches) return;
            entries.forEach((entry) => {
                if (!entry.isIntersecting) return;
                notes.find(({ reference }) => reference === entry.target)
                    ?.connector.classList.add('is-drawn');
            });
        }, { rootMargin: '-8% 0px -8% 0px', threshold: 0.1 });
        notes.forEach(({ reference }) => connectorObserver.observe(reference));
    } else {
        notes.forEach(({ connector }) => connector.classList.add('is-drawn'));
    }

    notes.forEach((item) => {
        item.reference.addEventListener('pointerenter', () => {
            if (!hoverInteraction.matches) return;
            if (wideLayout.matches) setActive(item);
            else showPopover(item);
        });
        item.reference.addEventListener('pointerleave', () => {
            if (!hoverInteraction.matches) return;
            if (wideLayout.matches) setActive(null);
            else schedulePopoverClose();
        });
        item.reference.addEventListener('focus', () => {
            if (wideLayout.matches) setActive(item);
            else showPopover(item);
        });
        item.reference.addEventListener('blur', () => {
            if (wideLayout.matches) setActive(null);
            else schedulePopoverClose();
        });
        item.reference.addEventListener('click', (event) => {
            if (wideLayout.matches) {
                event.preventDefault();
                setActive(item);
                return;
            }
            if (popoverLayout.matches) {
                event.preventDefault();
                showPopover(item);
            }
        });

        item.note.addEventListener('pointerenter', () => {
            clearCloseTimer();
            setActive(item);
        });
        item.note.addEventListener('pointerleave', () => setActive(null));
        item.note.addEventListener('focusin', () => setActive(item));
        item.note.addEventListener('focusout', () => setActive(null));
    });

    popover.addEventListener('pointerenter', clearCloseTimer);
    popover.addEventListener('pointerleave', schedulePopoverClose);
    popover.addEventListener('focusin', clearCloseTimer);
    popover.addEventListener('focusout', schedulePopoverClose);

    document.addEventListener('pointerdown', (event) => {
        if (
            popover.classList.contains('is-visible') &&
            event.target instanceof Node &&
            !popover.contains(event.target) &&
            !notes.some(({ reference }) => reference.contains(event.target as Node))
        ) hidePopover();
    });
    window.addEventListener('keydown', (event) => {
        if (event.key === 'Escape' && popover.classList.contains('is-visible')) hidePopover();
    });
    window.addEventListener('scroll', () => {
        if (popover.classList.contains('is-visible')) hidePopover();
    }, { passive: true });
    window.addEventListener('resize', () => {
        hidePopover();
        layoutSidenotes();
    }, { passive: true });
    wideLayout.addEventListener('change', () => {
        hidePopover();
        layoutSidenotes();
    });

    layoutSidenotes();
    window.requestAnimationFrame(layoutSidenotes);
    void document.fonts?.ready.then(layoutSidenotes);
}

function setupMarkdownRoughAnnotations(): void {
    const content = document.querySelector<HTMLElement>('.main-article .article-content');
    const roughNotation = window.RoughNotation;
    if (!content || !roughNotation) return;

    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const annotationItems: Array<{ element: HTMLElement; annotation: RoughAnnotation }> = [];
    const addAnnotations = (
        selector: string,
        config: Omit<RoughAnnotationConfig, 'animate'>
    ): void => {
        content.querySelectorAll<HTMLElement>(selector).forEach((element) => {
            if (
                element.closest('.footnotes, pre, code, h1, h2, h3, h4, h5, h6') ||
                (element.parentElement?.matches('strong, em') ?? false)
            ) return;

            annotationItems.push({
                element,
                annotation: roughNotation.annotate(element, {
                    ...config,
                    animate: !reduceMotion
                })
            });
        });
    };

    addAnnotations('strong', {
        type: 'underline',
        animationDuration: 420,
        color: 'var(--accent-color)',
        strokeWidth: 1.4,
        padding: 1,
        multiline: true,
        iterations: 1
    });
    addAnnotations('em', {
        type: 'underline',
        animationDuration: 380,
        color: 'var(--card-text-color-secondary)',
        strokeWidth: 1.2,
        padding: 1,
        multiline: true,
        iterations: 1
    });
    addAnnotations('blockquote', {
        type: 'bracket',
        brackets: 'right',
        animationDuration: 520,
        color: 'var(--accent-color)',
        strokeWidth: 1.6,
        padding: 5,
        iterations: 2
    });
    addAnnotations('del', {
        type: 'crossed-off',
        animationDuration: 430,
        color: 'var(--card-text-color-tertiary)',
        strokeWidth: 1.3,
        padding: 1,
        multiline: true,
        iterations: 1
    });
    addAnnotations('mark', {
        type: 'highlight',
        animationDuration: 480,
        color: 'rgba(250, 204, 21, 0.28)',
        padding: 1,
        multiline: true,
        iterations: 1
    });

    if (annotationItems.length === 0) return;
    if (!('IntersectionObserver' in window) || reduceMotion) {
        annotationItems.forEach(({ annotation }) => annotation.show());
        return;
    }

    const observer = new IntersectionObserver((entries) => {
        entries.forEach((entry) => {
            if (!entry.isIntersecting) return;
            const item = annotationItems.find(({ element }) => element === entry.target);
            if (!item) return;
            item.annotation.show();
            observer.unobserve(item.element);
        });
    }, { rootMargin: '0px 0px -12% 0px', threshold: 0.45 });
    annotationItems.forEach(({ element }) => observer.observe(element));
}

function setupArticleFocusMode(): void {
    if (!document.documentElement.classList.contains('article-focus-mode')) return;

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
    setupArticleSidenotes();
    setupMarkdownRoughAnnotations();
    setupArticleFocusMode();
});

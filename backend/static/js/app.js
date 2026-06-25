(() => {
    const backdrop = document.getElementById("modal-backdrop");
    const modalContent = document.getElementById("modal-content");
    const openLoaderOverlay = document.getElementById("app-open-loader");
    const currencyFormatter = new Intl.NumberFormat("pt-BR", {
        style: "currency",
        currency: "BRL",
    });

    const VIEW_MODE_KEY = "nexo_view_mode";
    const VIEW_MODE_MOBILE = "mobile";
    const VIEW_MODE_BROWSER = "browser";

    const initOpenLoader = () => {
        if (!(openLoaderOverlay instanceof HTMLElement)) {
            return;
        }

        if (openLoaderOverlay.dataset.ready === "1") {
            return;
        }
        openLoaderOverlay.dataset.ready = "1";

        const closeOpenLoader = () => {
            if (openLoaderOverlay.dataset.closed === "1") {
                return;
            }
            openLoaderOverlay.dataset.closed = "1";
            openLoaderOverlay.classList.add("is-exiting");
            window.setTimeout(() => {
                openLoaderOverlay.remove();
            }, 300);
        };

        const OPEN_LOADER_VISIBLE_MS = 2600;
        window.setTimeout(closeOpenLoader, OPEN_LOADER_VISIBLE_MS);
        window.addEventListener("pageshow", closeOpenLoader, { once: true });
    };
    const parseAmountToCents = (value) => {
        const raw = (value || "").toString();
        const digitsOnly = raw.replace(/\D/g, "");

        if (!digitsOnly) {
            return null;
        }

        const cents = Number.parseInt(digitsOnly, 10);
        return Number.isFinite(cents) ? Math.max(0, cents) : null;
    };

    const applyCurrencyMask = (input, cents) => {
        if (!Number.isFinite(cents)) {
            input.value = "";
            input.dataset.rawValue = "";
            return;
        }

        const safeCents = Math.max(0, cents);
        const rawValue = (safeCents / 100).toFixed(2);
        input.dataset.rawValue = rawValue;
        input.value = currencyFormatter.format(safeCents / 100);
    };

    const initCurrencyMasks = (root = document) => {
        const inputs = root.querySelectorAll('input[name="amount"], input[name="target_amount"]');

        inputs.forEach((input) => {
            if (input.dataset.currencyReady === "1") {
                return;
            }

            input.dataset.currencyReady = "1";
            input.inputMode = "numeric";
            input.autocomplete = "off";

            const initialCents = parseAmountToCents(input.value);
            if (initialCents !== null) {
                applyCurrencyMask(input, initialCents);
            } else {
                input.dataset.rawValue = "";
            }

            input.addEventListener("input", () => {
                const cents = parseAmountToCents(input.value);
                if (cents === null) {
                    input.value = "";
                    input.dataset.rawValue = "";
                    return;
                }
                applyCurrencyMask(input, cents);
            });

            input.addEventListener("blur", () => {
                if (!input.dataset.rawValue) {
                    input.value = "";
                }
            });
        });
    };

    const closeActionCards = (exceptCard = null) => {
        document.querySelectorAll("[data-press-actions].app-actions-open").forEach((card) => {
            if (card !== exceptCard) {
                card.classList.remove("app-actions-open");
            }
        });
    };

    let actionOutsideBound = false;

    const initPressActions = (root = document) => {
        const cards = root.querySelectorAll("[data-press-actions]");
        if (!cards.length) {
            return;
        }

        if (!actionOutsideBound) {
            actionOutsideBound = true;
            document.addEventListener("pointerdown", (event) => {
                if (!event.target.closest("[data-press-actions]")) {
                    closeActionCards();
                    closeTransactionActionMenus();
                }
            });
        }

        cards.forEach((card) => {
            if (card.dataset.pressReady === "1") {
                return;
            }

            card.dataset.pressReady = "1";
            let timerId = null;
            let longPressTriggered = false;

            const startPress = (event) => {
                const isCoarse = window.matchMedia && window.matchMedia("(pointer: coarse)").matches;
                if (!isCoarse) {
                    return;
                }

                if (event.target.closest("a,button,input,select,textarea,label")) {
                    return;
                }

                longPressTriggered = false;
                timerId = window.setTimeout(() => {
                    longPressTriggered = true;
                    const shouldOpen = !card.classList.contains("app-actions-open");
                    closeActionCards(card);
                    card.classList.toggle("app-actions-open", shouldOpen);
                }, 420);
            };

            const cancelPress = () => {
                if (timerId) {
                    window.clearTimeout(timerId);
                    timerId = null;
                }
            };

            card.addEventListener("pointerdown", startPress);
            card.addEventListener("pointerup", cancelPress);
            card.addEventListener("pointercancel", cancelPress);
            card.addEventListener("pointerleave", cancelPress);

            card.addEventListener("click", (event) => {
                if (longPressTriggered) {
                    event.preventDefault();
                    event.stopPropagation();
                    longPressTriggered = false;
                }
            });
        });
    };

    const getStoredViewMode = () => {
        try {
            const stored = window.localStorage.getItem(VIEW_MODE_KEY);
            return stored === VIEW_MODE_BROWSER ? VIEW_MODE_BROWSER : VIEW_MODE_MOBILE;
        } catch {
            return VIEW_MODE_MOBILE;
        }
    };

    const persistViewMode = (mode) => {
        try {
            window.localStorage.setItem(VIEW_MODE_KEY, mode);
        } catch {}
    };

    const applyViewMode = (mode) => {
        const resolvedMode = mode === VIEW_MODE_BROWSER ? VIEW_MODE_BROWSER : VIEW_MODE_MOBILE;
        document.documentElement.classList.toggle("view-browser", resolvedMode === VIEW_MODE_BROWSER);
        document.documentElement.classList.toggle("view-mobile", resolvedMode !== VIEW_MODE_BROWSER);

        const nextLabel = resolvedMode === VIEW_MODE_BROWSER ? "Modo celular" : "Modo navegador";
        document.querySelectorAll("[data-view-mode-toggle]").forEach((toggleButton) => {
            if (!(toggleButton instanceof HTMLElement)) {
                return;
            }
            toggleButton.textContent = nextLabel;
            toggleButton.setAttribute("aria-label", nextLabel);
            toggleButton.dataset.viewModeCurrent = resolvedMode;
        });
    };

    const toggleViewMode = () => {
        const currentMode = getStoredViewMode();
        const nextMode = currentMode === VIEW_MODE_BROWSER ? VIEW_MODE_MOBILE : VIEW_MODE_BROWSER;
        persistViewMode(nextMode);
        applyViewMode(nextMode);
    };

    const initViewModeToggles = (root = document) => {
        const toggles = root.querySelectorAll("[data-view-mode-toggle]");
        if (!toggles.length) {
            return;
        }

        toggles.forEach((toggleButton) => {
            if (!(toggleButton instanceof HTMLElement) || toggleButton.dataset.viewModeReady === "1") {
                return;
            }

            toggleButton.dataset.viewModeReady = "1";
            toggleButton.addEventListener("click", () => {
                toggleViewMode();
            });
        });

        applyViewMode(getStoredViewMode());
    };


    const initSwipeNav = (root = document) => {
        const navs = root.querySelectorAll("[data-swipe-nav]");
        if (!navs.length) {
            return;
        }

        navs.forEach((nav) => {
            if (!(nav instanceof HTMLElement) || nav.dataset.swipeReady === "1") {
                return;
            }

            nav.dataset.swipeReady = "1";
            let dragging = false;
            let startX = 0;
            let startLeft = 0;
            let moved = false;

            const releaseDrag = () => {
                if (!dragging) {
                    return;
                }
                dragging = false;
                nav.classList.remove("is-dragging");
                window.setTimeout(() => {
                    moved = false;
                }, 0);
            };

            nav.addEventListener("pointerdown", (event) => {
                if (event.pointerType !== "mouse" || event.button !== 0) {
                    return;
                }

                if (event.target.closest("a,button,input,select,textarea,label")) {
                    return;
                }

                dragging = true;
                startX = event.clientX;
                startLeft = nav.scrollLeft;
                moved = false;
                nav.classList.add("is-dragging");
            });

            nav.addEventListener("pointermove", (event) => {
                if (!dragging) {
                    return;
                }

                const deltaX = event.clientX - startX;
                if (Math.abs(deltaX) > 4) {
                    moved = true;
                    nav.scrollLeft = startLeft - deltaX;
                }
            });

            nav.addEventListener("pointerup", releaseDrag);
            nav.addEventListener("pointercancel", releaseDrag);
            nav.addEventListener("pointerleave", releaseDrag);

            nav.addEventListener("click", (event) => {
                if (!moved) {
                    return;
                }
                if (event.target.closest("a,button")) {
                    event.preventDefault();
                    event.stopPropagation();
                }
            }, true);
        });
    };
    const closeTransactionActionMenus = (exceptMenu = null) => {
        document.querySelectorAll("details[data-txn-actions][open]").forEach((menu) => {
            if (menu !== exceptMenu) {
                menu.removeAttribute("open");
            }
        });
    };

    let txnMenuOutsideBound = false;

    const getBottomNavHeight = () => {
        const bottomNav = document.querySelector(".txn-bottom-nav, .dash-bottom-nav, .app-bottom-nav");
        return bottomNav ? bottomNav.getBoundingClientRect().height : 0;
    };

    const positionTransactionActionMenu = (menu) => {
        if (!(menu instanceof HTMLElement) || !menu.open) {
            return;
        }

        const panel = menu.querySelector(".txn-actions-menu");
        if (!(panel instanceof HTMLElement)) {
            return;
        }

        menu.classList.remove("txn-actions-dropdown-up");

        const triggerRect = menu.getBoundingClientRect();
        const panelHeight = panel.offsetHeight || 220;
        const bottomInset = getBottomNavHeight();
        const viewportPadding = 10;

        const spaceBelow = window.innerHeight - triggerRect.bottom - bottomInset - viewportPadding;
        const spaceAbove = triggerRect.top - viewportPadding;
        const shouldOpenUp = spaceBelow < panelHeight && spaceAbove > spaceBelow;

        menu.classList.toggle("txn-actions-dropdown-up", shouldOpenUp);
    };

    const positionOpenTransactionMenus = () => {
        document.querySelectorAll("details[data-txn-actions][open]").forEach((menu) => {
            positionTransactionActionMenu(menu);
        });
    };

    const initTransactionActionMenus = (root = document) => {
        const menus = root.querySelectorAll("details[data-txn-actions]");
        if (!menus.length) {
            return;
        }

        if (!txnMenuOutsideBound) {
            txnMenuOutsideBound = true;
            document.addEventListener("pointerdown", (event) => {
                if (!event.target.closest("details[data-txn-actions]")) {
                    closeTransactionActionMenus();
                }
            });

            window.addEventListener("resize", positionOpenTransactionMenus, { passive: true });
            window.addEventListener("scroll", positionOpenTransactionMenus, { passive: true });
        }

        menus.forEach((menu) => {
            if (menu.dataset.dropdownReady === "1") {
                return;
            }

            menu.dataset.dropdownReady = "1";
            menu.addEventListener("toggle", () => {
                if (menu.open) {
                    closeTransactionActionMenus(menu);
                    window.requestAnimationFrame(() => {
                        positionTransactionActionMenu(menu);
                    });
                    return;
                }

                menu.classList.remove("txn-actions-dropdown-up");
            });
        });
    };

    const openModal = () => {
        if (!backdrop) {
            return;
        }

        backdrop.classList.remove("hidden");
        backdrop.classList.add("flex");
        document.body.classList.add("overflow-hidden");
    };

    const closeModal = () => {
        if (!backdrop || !modalContent) {
            return;
        }

        backdrop.classList.add("hidden");
        backdrop.classList.remove("flex");
        modalContent.innerHTML = "";
        document.body.classList.remove("overflow-hidden");
    };

    window.financeApp = {
        openModal,
        closeModal,
        closeTxnMenus: () => closeTransactionActionMenus(),
    };

    if (backdrop) {
        backdrop.addEventListener("click", (event) => {
            if (event.target.id === "modal-backdrop") {
                closeModal();
            }
        });
    }

    document.body.addEventListener("htmx:beforeRequest", (event) => {
        const trigger = event.detail && event.detail.elt;
        if (!(trigger instanceof HTMLElement)) {
            return;
        }

        const targetSelector = trigger.getAttribute("hx-target");
        if (targetSelector === "#modal-content") {
            closeTransactionActionMenus();
        }
    });

    document.body.addEventListener("htmx:afterSwap", (event) => {
        if (event.detail && event.detail.target) {
            initCurrencyMasks(event.detail.target);
            initPressActions(event.detail.target);
            initTransactionActionMenus(event.detail.target);
            initViewModeToggles(event.detail.target);
            initSwipeNav(event.detail.target);
        }

        if (
            backdrop
            && modalContent
            && event.detail
            && event.detail.target
            && event.detail.target.id === "modal-content"
            && modalContent.innerHTML.trim()
        ) {
            closeTransactionActionMenus();
            openModal();
        }
    });

    document.addEventListener(
        "submit",
        (event) => {
            const form = event.target;
            if (!(form instanceof HTMLFormElement)) {
                return;
            }

            const currencyInputs = form.querySelectorAll('input[data-currency-ready="1"]');
            if (!currencyInputs.length) {
                return;
            }

            currencyInputs.forEach((currencyInput) => {
                currencyInput.value = currencyInput.dataset.rawValue || currencyInput.value;
            });
        },
        true
    );


    const refreshStatementPanels = () => {
        if (!window.htmx) {
            return;
        }

        ["statement-balance", "statement-list"].forEach((elementId) => {
            const panel = document.getElementById(elementId);
            if (!(panel instanceof HTMLElement)) {
                return;
            }

            const endpoint = panel.getAttribute("hx-get");
            if (!endpoint) {
                return;
            }

            window.htmx.ajax("GET", endpoint, {
                target: `#${elementId}`,
                swap: "innerHTML",
            });
        });
    };

    document.body.addEventListener("htmx:afterRequest", (event) => {
        const detail = event.detail || {};
        const requestPath = (detail.pathInfo && detail.pathInfo.requestPath) || "";
        if (!/\/transactions\/\d+\/toggle-(cleared|ignored)\/?$/.test(requestPath)) {
            return;
        }

        const xhr = detail.xhr;
        const status = xhr ? xhr.status : 0;
        if (status < 200 || status >= 400) {
            return;
        }

        closeTransactionActionMenus();
        refreshStatementPanels();
    });
    document.body.addEventListener("closeModal", closeModal);
    document.body.addEventListener("closeTxnMenus", () => closeTransactionActionMenus());
    document.body.addEventListener("transactionUpdated", () => closeTransactionActionMenus());

    document.addEventListener("keydown", (event) => {
        if (event.key === "Escape") {
            closeModal();
            closeActionCards();
            closeTransactionActionMenus();
        }
    });

    initOpenLoader();
    initCurrencyMasks(document);
    initPressActions(document);
    initTransactionActionMenus(document);
    initViewModeToggles(document);
    initSwipeNav(document);
    applyViewMode(getStoredViewMode());
})();








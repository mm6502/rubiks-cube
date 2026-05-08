import styles from './about-modal.module.css';

declare const __APP_VERSION__: string;
declare const __BUILD_DATE__: string;

export class AboutModal {
    private backdrop: HTMLElement | null = null;

    open(): void {
        if (this.backdrop) {
            this.backdrop.classList.remove(styles.hidden);
            return;
        }

        this.backdrop = document.createElement('div');
        this.backdrop.className = `${styles.backdrop}`;
        this.backdrop.setAttribute('role', 'dialog');
        this.backdrop.setAttribute('aria-modal', 'true');
        this.backdrop.setAttribute('aria-label', "About Rubik's Cube");

        this.backdrop.innerHTML = `
            <div class="${styles.dialog}">
                <div class="${styles.header}">
                    <h2 class="${styles.title}">Rubik's Cube v${__APP_VERSION__} (${__BUILD_DATE__})</h2>
                    <button class="${styles.closeButton}" aria-label="Close about dialog">&#x2715;</button>
                </div>
                <p class="${styles.description}">
                    Interactive Rubik's Cube simulator and visualizer.
                    Runs entirely in the browser as a single HTML file,
                    with multiple visualization modes and full WCA move notation support.
                </p>
                <div class="${styles.links}">
                    <a class="${styles.link}" href="https://github.com/mm6502/rubiks-cube" target="_blank" rel="noopener noreferrer">
                        &#128279; GitHub Repository
                    </a>
                </div>
                <p class="${styles.license}">Licensed under the EUPL-1.2</p>
            </div>
        `;

        const closeBtn = this.backdrop.querySelector<HTMLButtonElement>(`.${styles.closeButton}`);
        closeBtn?.addEventListener('click', () => this.close());

        this.backdrop.addEventListener('click', e => {
            if (e.target === this.backdrop) this.close();
        });

        document.addEventListener('keydown', this.handleKeyDown);

        document.body.appendChild(this.backdrop);
    }

    close(): void {
        if (!this.backdrop) return;
        this.backdrop.classList.add(styles.hidden);
        document.removeEventListener('keydown', this.handleKeyDown);
    }

    private handleKeyDown = (e: KeyboardEvent): void => {
        if (e.key === 'Escape') this.close();
    };
}

// LOADING STATES


class LoadingStateManager {
    constructor() {
        this.activeLoaders = new Map();
        this.createStyles();
    }

    createStyles() {
        const style = document.createElement('style');
        style.textContent = `
            .pro-loader-overlay {
                position: fixed;
                top: 0;
                left: 0;
                right: 0;
                bottom: 0;
                background: rgba(10, 10, 10, 0.95);
                backdrop-filter: blur(10px);
                z-index: 99999;
                display: flex;
                align-items: center;
                justify-content: center;
                animation: fadeIn 0.3s ease;
            }

            .pro-loader-content {
                background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%);
                border-radius: 16px;
                padding: 40px;
                min-width: 400px;
                max-width: 600px;
                box-shadow: 0 20px 60px rgba(0,0,0,0.5);
                animation: scaleIn 0.4s ease;
            }

            .pro-loader-title {
                font-size: 24px;
                font-weight: 700;
                color: #fff;
                margin-bottom: 10px;
                display: flex;
                align-items: center;
                gap: 12px;
            }

            .pro-loader-status {
                font-size: 14px;
                color: #aaa;
                margin-bottom: 20px;
            }

            .pro-loader-progress {
                width: 100%;
                height: 8px;
                background: #2a2a3e;
                border-radius: 4px;
                overflow: hidden;
                margin-bottom: 12px;
                position: relative;
            }

            .pro-loader-progress-bar {
                height: 100%;
                background: linear-gradient(90deg, #4CAF50, #8BC34A);
                border-radius: 4px;
                transition: width 0.3s ease;
                position: relative;
                overflow: hidden;
            }

            .pro-loader-progress-bar::after {
                content: '';
                position: absolute;
                top: 0;
                left: 0;
                right: 0;
                bottom: 0;
                background: linear-gradient(90deg, transparent, rgba(255,255,255,0.3), transparent);
                animation: shimmer 2s infinite;
            }

            @keyframes shimmer {
                0% { transform: translateX(-100%); }
                100% { transform: translateX(100%); }
            }

            .pro-loader-stats {
                display: flex;
                justify-content: space-between;
                font-size: 12px;
                color: #888;
            }

            .pro-loader-eta {
                color: #4CAF50;
            }

            .skeleton-loader {
                background: linear-gradient(90deg, #2a2a3e 25%, #3a3a4e 50%, #2a2a3e 75%);
                background-size: 200% 100%;
                animation: skeletonLoading 1.5s infinite;
                border-radius: 4px;
            }

            @keyframes skeletonLoading {
                0% { background-position: 200% 0; }
                100% { background-position: -200% 0; }
            }

            .pro-spinner {
                width: 40px;
                height: 40px;
                border: 4px solid #2a2a3e;
                border-top-color: #4CAF50;
                border-radius: 50%;
                animation: spin 1s linear infinite;
            }

            @keyframes spin {
                to { transform: rotate(360deg); }
            }
        `;
        document.head.appendChild(style);
    }

    // ========== FULL SCREEN LOADER WITH PROGRESS ==========
    showLoader(options = {}) {
        const {
            id = 'default',
            title = 'Loading...',
            status = 'Please wait',
            showProgress = true,
            showETA = true
        } = options;

        // Remove existing loader with same ID
        this.hideLoader(id);

        const overlay = document.createElement('div');
        overlay.className = 'pro-loader-overlay';
        overlay.id = `pro-loader-${id}`;

        overlay.innerHTML = `
            <div class="pro-loader-content">
                <div class="pro-loader-title">
                    <div class="pro-spinner"></div>
                    <span>${title}</span>
                </div>
                <div class="pro-loader-status">${status}</div>
                ${showProgress ? `
                    <div class="pro-loader-progress">
                        <div class="pro-loader-progress-bar" style="width: 0%"></div>
                    </div>
                    <div class="pro-loader-stats">
                        <span class="pro-loader-current">0%</span>
                        ${showETA ? '<span class="pro-loader-eta">Calculating...</span>' : ''}
                    </div>
                ` : ''}
            </div>
        `;

        document.body.appendChild(overlay);

        const loaderState = {
            overlay,
            startTime: Date.now(),
            lastUpdate: Date.now(),
            progress: 0
        };

        this.activeLoaders.set(id, loaderState);

        return id;
    }

    updateLoader(id, progress, status = null) {
        const loader = this.activeLoaders.get(id);
        if (!loader) return;

        loader.progress = progress;
        loader.lastUpdate = Date.now();

        const progressBar = loader.overlay.querySelector('.pro-loader-progress-bar');
        const currentText = loader.overlay.querySelector('.pro-loader-current');
        const statusText = loader.overlay.querySelector('.pro-loader-status');
        const etaText = loader.overlay.querySelector('.pro-loader-eta');

        if (progressBar) {
            progressBar.style.width = `${progress}%`;
        }

        if (currentText) {
            currentText.textContent = `${Math.round(progress)}%`;
        }

        if (status && statusText) {
            statusText.textContent = status;
        }

        if (etaText && progress > 0) {
            const elapsed = Date.now() - loader.startTime;
            const rate = progress / elapsed;
            const remaining = (100 - progress) / rate;
            const seconds = Math.ceil(remaining / 1000);
            
            if (seconds > 60) {
                const minutes = Math.ceil(seconds / 60);
                etaText.textContent = `About ${minutes} minute${minutes > 1 ? 's' : ''} remaining`;
            } else if (seconds > 0) {
                etaText.textContent = `About ${seconds} second${seconds > 1 ? 's' : ''} remaining`;
            } else {
                etaText.textContent = 'Almost done...';
            }
        }
    }

    hideLoader(id) {
        const loader = this.activeLoaders.get(id);
        if (!loader) return;

        loader.overlay.style.animation = 'fadeOut 0.3s ease';
        setTimeout(() => {
            loader.overlay.remove();
            this.activeLoaders.delete(id);
        }, 300);
    }

    // ========== SKELETON SCREEN ==========
    createSkeleton(container, type = 'default') {
        const templates = {
            'track-list': `
                <div style="padding: 10px;">
                    ${Array(5).fill(0).map(() => `
                        <div style="margin-bottom: 10px;">
                            <div class="skeleton-loader" style="height: 50px; width: 100%;"></div>
                        </div>
                    `).join('')}
                </div>
            `,
            'clip-grid': `
                <div style="display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; padding: 10px;">
                    ${Array(8).fill(0).map(() => `
                        <div class="skeleton-loader" style="height: 80px;"></div>
                    `).join('')}
                </div>
            `,
            'default': `
                <div style="padding: 20px;">
                    <div class="skeleton-loader" style="height: 30px; width: 60%; margin-bottom: 15px;"></div>
                    <div class="skeleton-loader" style="height: 20px; width: 80%; margin-bottom: 10px;"></div>
                    <div class="skeleton-loader" style="height: 20px; width: 70%;"></div>
                </div>
            `
        };

        const skeleton = document.createElement('div');
        skeleton.className = 'skeleton-container';
        skeleton.innerHTML = templates[type] || templates.default;
        
        container.appendChild(skeleton);
        
        return () => {
            skeleton.style.animation = 'fadeOut 0.3s ease';
            setTimeout(() => skeleton.remove(), 300);
        };
    }

    // ========== SMOOTH TRANSITION ==========
    smoothTransition(fromElement, toElement, duration = 300) {
        return new Promise(resolve => {
            // Fade out old content
            fromElement.style.transition = `opacity ${duration}ms ease`;
            fromElement.style.opacity = '0';

            setTimeout(() => {
                fromElement.style.display = 'none';
                toElement.style.opacity = '0';
                toElement.style.display = 'block';

                // Fade in new content
                requestAnimationFrame(() => {
                    toElement.style.transition = `opacity ${duration}ms ease`;
                    toElement.style.opacity = '1';
                });

                setTimeout(resolve, duration);
            }, duration);
        });
    }
}

// Global instance
window.loadingState = new LoadingStateManager();

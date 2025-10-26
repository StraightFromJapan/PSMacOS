// ========================================
// NOTIFICATION SYSTEM

class NotificationSystem {
    constructor() {
        this.activeModals = [];
        this.createContainer();
    }

    createContainer() {
        if (document.getElementById('notification-container')) return;
        
        const container = document.createElement('div');
        container.id = 'notification-container';
        container.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            z-index: 10000;
            pointer-events: none;
        `;
        document.body.appendChild(container);
    }

    // Show toast notification (non-blocking)
    toast(message, type = 'info', duration = 3000) {
        const toast = document.createElement('div');
        const icons = {
            success: '✓',
            error: '✕',
            warning: '⚠',
            info: 'ℹ'
        };
        const colors = {
            success: '#4CAF50',
            error: '#f44336',
            warning: '#ff9800',
            info: '#2196F3'
        };

        toast.style.cssText = `
            background: ${colors[type] || colors.info};
            color: white;
            padding: 15px 20px;
            margin-bottom: 10px;
            border-radius: 8px;
            box-shadow: 0 4px 12px rgba(0,0,0,0.3);
            display: flex;
            align-items: center;
            gap: 10px;
            min-width: 250px;
            max-width: 400px;
            pointer-events: all;
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
            font-size: 14px;
            animation: slideIn 0.3s ease;
        `;

        toast.innerHTML = `
            <span style="font-size: 18px; font-weight: bold;">${icons[type] || icons.info}</span>
            <span style="flex: 1;">${message}</span>
        `;

        const container = document.getElementById('notification-container');
        container.appendChild(toast);

        setTimeout(() => {
            toast.style.animation = 'slideOut 0.3s ease';
            setTimeout(() => toast.remove(), 300);
        }, duration);
    }

    // Show modal dialog (blocking)
    async modal(options = {}) {
        const {
            title = 'Notification',
            message = '',
            type = 'info', // 'info', 'success', 'error', 'warning', 'confirm'
            confirmText = 'OK',
            cancelText = 'Cancel',
            showCancel = false
        } = options;

        return new Promise((resolve) => {
            const overlay = document.createElement('div');
            overlay.style.cssText = `
                position: fixed;
                top: 0;
                left: 0;
                right: 0;
                bottom: 0;
                background: rgba(0, 0, 0, 0.7);
                z-index: 20000;
                display: flex;
                align-items: center;
                justify-content: center;
                animation: fadeIn 0.2s ease;
            `;

            const modal = document.createElement('div');
            modal.style.cssText = `
                background: #2a2a3e;
                border-radius: 12px;
                padding: 30px;
                min-width: 400px;
                max-width: 600px;
                box-shadow: 0 10px 40px rgba(0,0,0,0.5);
                animation: scaleIn 0.3s ease;
                color: white;
                font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
            `;

            const colors = {
                success: '#4CAF50',
                error: '#f44336',
                warning: '#ff9800',
                info: '#2196F3',
                confirm: '#ff9800'
            };
            const color = colors[type] || colors.info;

            modal.innerHTML = `
                <div style="display: flex; align-items: center; gap: 15px; margin-bottom: 20px;">
                    <div style="
                        width: 50px;
                        height: 50px;
                        border-radius: 50%;
                        background: ${color}22;
                        border: 3px solid ${color};
                        display: flex;
                        align-items: center;
                        justify-content: center;
                        font-size: 24px;
                        font-weight: bold;
                        color: ${color};
                    ">
                        ${type === 'success' ? '✓' : type === 'error' ? '✕' : type === 'warning' || type === 'confirm' ? '⚠' : 'ℹ'}
                    </div>
                    <h2 style="margin: 0; font-size: 22px; color: white;">${title}</h2>
                </div>
                <p style="
                    margin: 0 0 30px 0;
                    font-size: 15px;
                    line-height: 1.6;
                    color: #e0e0e0;
                ">${message}</p>
                <div style="display: flex; gap: 10px; justify-content: flex-end;">
                    ${showCancel || type === 'confirm' ? `
                        <button id="modal-cancel" style="
                            padding: 12px 24px;
                            background: #444;
                            color: white;
                            border: none;
                            border-radius: 6px;
                            cursor: pointer;
                            font-size: 14px;
                            font-weight: 600;
                            transition: all 0.2s;
                        " onmouseover="this.style.background='#555'" onmouseout="this.style.background='#444'">
                            ${cancelText}
                        </button>
                    ` : ''}
                    <button id="modal-confirm" style="
                        padding: 12px 24px;
                        background: ${color};
                        color: white;
                        border: none;
                        border-radius: 6px;
                        cursor: pointer;
                        font-size: 14px;
                        font-weight: 600;
                        transition: all 0.2s;
                    " onmouseover="this.style.opacity='0.9'" onmouseout="this.style.opacity='1'">
                        ${confirmText}
                    </button>
                </div>
            `;

            overlay.appendChild(modal);
            document.body.appendChild(overlay);

            const confirmBtn = modal.querySelector('#modal-confirm');
            const cancelBtn = modal.querySelector('#modal-cancel');

            const close = (result) => {
                overlay.style.animation = 'fadeOut 0.2s ease';
                setTimeout(() => {
                    overlay.remove();
                    resolve(result);
                }, 200);
            };

            confirmBtn.addEventListener('click', () => close(true));
            if (cancelBtn) {
                cancelBtn.addEventListener('click', () => close(false));
            }
            overlay.addEventListener('click', (e) => {
                if (e.target === overlay) close(false);
            });

            // Focus confirm button
            setTimeout(() => confirmBtn.focus(), 100);

            // ESC to cancel
            const escHandler = (e) => {
                if (e.key === 'Escape') {
                    close(false);
                    document.removeEventListener('keydown', escHandler);
                }
            };
            document.addEventListener('keydown', escHandler);
        });
    }

    // Convenience methods
    success(message, duration) {
        return this.toast(message, 'success', duration);
    }

    error(message, duration) {
        return this.toast(message, 'error', duration);
    }

    warning(message, duration) {
        return this.toast(message, 'warning', duration);
    }

    info(message, duration) {
        return this.toast(message, 'info', duration);
    }

    async confirm(message, title = 'Confirm') {
        return this.modal({
            title,
            message,
            type: 'confirm',
            confirmText: 'Yes',
            cancelText: 'No',
            showCancel: true
        });
    }

    async alert(message, title = 'Alert', type = 'info') {
        return this.modal({
            title,
            message,
            type,
            confirmText: 'OK'
        });
    }
}

// Add CSS animations
const style = document.createElement('style');
style.textContent = `
    @keyframes fadeIn {
        from { opacity: 0; }
        to { opacity: 1; }
    }
    @keyframes fadeOut {
        from { opacity: 1; }
        to { opacity: 0; }
    }
    @keyframes scaleIn {
        from { transform: scale(0.9); opacity: 0; }
        to { transform: scale(1); opacity: 1; }
    }
    @keyframes slideIn {
        from { transform: translateX(400px); opacity: 0; }
        to { transform: translateX(0); opacity: 1; }
    }
    @keyframes slideOut {
        from { transform: translateX(0); opacity: 1; }
        to { transform: translateX(400px); opacity: 0; }
    }
`;
document.head.appendChild(style);

// Global instance
window.notify = new NotificationSystem();

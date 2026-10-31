/**
 * College-Chalo Client API Service
 * Manages authentication tokens and communications with the Flask backend.
 */

const API_BASE = '/api';

class ApiService {
    static getToken() {
        return localStorage.getItem('college_chalo_token');
    }

    static setToken(token) {
        if (token) {
            localStorage.setItem('college_chalo_token', token);
        } else {
            localStorage.removeItem('college_chalo_token');
        }
    }

    static clearAuth() {
        localStorage.removeItem('college_chalo_token');
        localStorage.removeItem('college_chalo_user');
    }

    static getStoredUser() {
        try {
            const raw = localStorage.getItem('college_chalo_user');
            return raw ? JSON.parse(raw) : null;
        } catch (e) {
            return null;
        }
    }

    static setStoredUser(user) {
        if (user) {
            localStorage.setItem('college_chalo_user', JSON.stringify(user));
        } else {
            localStorage.removeItem('college_chalo_user');
        }
    }

    static async request(endpoint, options = {}) {
        const url = `${API_BASE}${endpoint}`;
        const headers = {
            'Content-Type': 'application/json',
            ...(options.headers || {})
        };

        const token = this.getToken();
        if (token) {
            headers['Authorization'] = `Bearer ${token}`;
        }

        const config = {
            ...options,
            headers
        };

        try {
            const res = await fetch(url, config);
            const data = await res.json().catch(() => ({}));

            if (!res.ok) {
                const errorMsg = data.error || `HTTP ${res.status}: ${res.statusText}`;
                const err = new Error(errorMsg);
                err.status = res.status;
                err.data = data;
                throw err;
            }

            return data;
        } catch (error) {
            throw error;
        }
    }

    // Auth endpoints
    static async register(payload) {
        const res = await this.request('/auth/register', {
            method: 'POST',
            body: JSON.stringify(payload)
        });
        if (res.token) {
            this.setToken(res.token);
            this.setStoredUser(res.user);
        }
        return res;
    }

    static async login(email, password) {
        const res = await this.request('/auth/login', {
            method: 'POST',
            body: JSON.stringify({ email, password })
        });
        if (res.token) {
            this.setToken(res.token);
            this.setStoredUser(res.user);
        }
        return res;
    }

    static async getMe() {
        return await this.request('/auth/me');
    }

    static async demoSwitch(role) {
        const res = await this.request('/auth/demo-switch', {
            method: 'POST',
            body: JSON.stringify({ role })
        });
        if (res.token) {
            this.setToken(res.token);
            this.setStoredUser(res.user);
        }
        return res;
    }

    static async updateProfile(payload) {
        return await this.request('/auth/profile/update', {
            method: 'POST',
            body: JSON.stringify(payload)
        });
    }

    // Rides endpoints
    static async getRides(filters = {}) {
        const params = new URLSearchParams();
        if (filters.origin) params.append('origin', filters.origin);
        if (filters.destination) params.append('destination', filters.destination);
        if (filters.date) params.append('date', filters.date);
        const query = params.toString() ? `?${params.toString()}` : '';
        return await this.request(`/rides${query}`);
    }

    static async createRide(payload) {
        return await this.request('/rides', {
            method: 'POST',
            body: JSON.stringify(payload)
        });
    }

    // Booking endpoints
    static async bookRide(rideId, payload) {
        return await this.request(`/rides/${rideId}/book`, {
            method: 'POST',
            body: JSON.stringify(payload)
        });
    }

    static async getBookings() {
        return await this.request('/bookings');
    }

    // Notifications
    static async getNotifications() {
        return await this.request('/notifications');
    }

    // Automated Test Suite runner
    static async runTestSuite() {
        return await this.request('/tests/run', {
            method: 'POST'
        });
    }
}

// Global UI Toast system
function showToast(message, type = 'info') {
    let container = document.getElementById('toastContainer');
    if (!container) {
        container = document.createElement('div');
        container.id = 'toastContainer';
        container.className = 'toast-container';
        document.body.appendChild(container);
    }

    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    
    let iconSvg = '';
    if (type === 'error') {
        iconSvg = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>`;
    } else if (type === 'success') {
        iconSvg = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg>`;
    } else {
        iconSvg = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>`;
    }

    toast.innerHTML = `
        <div style="color: ${type === 'error' ? '#ef4444' : (type === 'success' ? '#10b981' : '#0284c7')}">${iconSvg}</div>
        <div style="flex: 1; font-weight: 500;">${message}</div>
    `;

    container.appendChild(toast);
    setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transform = 'translateY(10px)';
        toast.style.transition = 'all 0.3s ease';
        setTimeout(() => toast.remove(), 300);
    }, 4500);
}

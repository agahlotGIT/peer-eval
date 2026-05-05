// Auth check utility
async function checkAuth() {
    try {
        const user = await window.auth.getCurrentUser();
        if (!user) {
            window.location.href = 'login.html';
        }
        return user;
    } catch (error) {
        window.location.href = 'login.html';
    }
}

async function checkAuthAndRole(requiredRole) {
    try {
        const user = await window.auth.getCurrentUser();
        if (!user) {
            window.location.href = 'login.html';
            return;
        }
        const userRole = localStorage.getItem('userRole');
        if (userRole !== requiredRole) {
            // Redirect to appropriate page based on role
            if (userRole === 'student') {
                window.location.href = 'index.html';
            } else if (userRole === 'professor') {
                window.location.href = 'dashboard.html';
            } else {
                window.location.href = 'login.html';
            }
        }
        return user;
    } catch (error) {
        window.location.href = 'login.html';
    }
}

// Logout function
async function logout() {
    try {
        await window.auth.signOut();
        localStorage.removeItem('userRole');
        localStorage.removeItem('userEmail');
        window.location.href = 'login.html';
    } catch (error) {
        console.error('Error logging out:', error);
    }
}

window.authUtils = { checkAuth, checkAuthAndRole, logout };
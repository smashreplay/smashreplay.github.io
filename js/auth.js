const GOOGLE_CLIENT_ID = '161978008950-pi7h8k5pgqrodvit5qnnt44agat4gi9q.apps.googleusercontent.com';

// Called by Google Identity Services after the user picks an account
function handleCredentialResponse(response) {
    const payload = JSON.parse(atob(response.credential.split('.')[1]));
    currentUser = {
        name: payload.name,
        email: payload.email,
        picture: payload.picture,
        sub: payload.sub
    };
    localStorage.setItem('smashreplay_user', JSON.stringify(currentUser));
    updateAuthUI(currentUser);
}

// Called by the Sign out button
function signOut() {
    currentUser = null;
    driveAccessToken = null;
    driveTokenExpiry = 0;
    localStorage.removeItem('smashreplay_user');
    updateAuthUI(null);
}

function updateAuthUI(user) {
    const container = document.getElementById('auth-container');
    if (!container) return;
    const signedOut = container.querySelector('.auth-signed-out');
    const signedIn = container.querySelector('.auth-signed-in');
    if (user) {
        if (signedOut) signedOut.style.display = 'none';
        if (signedIn) signedIn.style.display = 'flex';
        const avatar = document.getElementById('auth-avatar');
        const nameEl = document.getElementById('auth-name');
        if (avatar) avatar.src = user.picture || '';
        if (nameEl) nameEl.textContent = user.name || user.email;
    } else {
        if (signedOut) signedOut.style.display = '';
        if (signedIn) signedIn.style.display = 'none';
    }
}

document.addEventListener('DOMContentLoaded', function () {
    const saved = localStorage.getItem('smashreplay_user');
    if (saved) {
        try {
            currentUser = JSON.parse(saved);
            updateAuthUI(currentUser);
        } catch (e) {
            localStorage.removeItem('smashreplay_user');
        }
    }
});

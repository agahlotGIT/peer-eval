document.addEventListener('DOMContentLoaded', () => {
    const loginForm = document.getElementById('loginForm');
    const errorMessage = document.getElementById('errorMessage');

    loginForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const email = document.getElementById('email').value;
        const password = document.getElementById('password').value;

        try {
            // Sign in with custom authentication
            console.log("Attempting login with email:", email);
            const data = await window.auth.signIn(email, password);
            console.log("Sign in result:", data);
            
            // Get role from authentication response (determined by which table user was found in)
            const userRole = data.user.role;
            console.log("Login successful, user role:", userRole, "redirecting to:", 
                userRole === 'student' ? 'index.html' : 
                userRole === 'professor' ? 'pDash.html' : 'unknown');

            // Redirect based on role from database
            if (userRole === 'student') {
                console.log("Redirecting student to sHome.html");
                window.location.href = 'sHome.html'; // Student home dashboard
            } else if (userRole === 'professor') {
                console.log("Redirecting professor to pDash.html");
                alert('Professor login successful! Redirecting to professor dashboard...');
                window.location.href = 'pDash.html'; // Professor Dashboard
            } else {
                console.log("Unknown role:", userRole);
                // Fallback
                errorMessage.textContent = 'Unknown user role';
                errorMessage.style.display = 'block';
            }
        } catch (error) {
            errorMessage.textContent = error.message;
            errorMessage.style.display = 'block';
        }
    });
});
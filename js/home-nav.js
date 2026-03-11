(function () {
    var nav = document.getElementById('main-nav');
    var hamburger = document.getElementById('nav-hamburger');
    var links = document.getElementById('nav-links');

    // Sticky scroll effect
    window.addEventListener('scroll', function () {
        if (window.scrollY > 50) {
            nav.classList.add('scrolled');
        } else {
            nav.classList.remove('scrolled');
        }
    }, { passive: true });

    // Mobile menu toggle
    if (hamburger && links) {
        hamburger.addEventListener('click', function () {
            var open = links.classList.toggle('open');
            hamburger.setAttribute('aria-expanded', open ? 'true' : 'false');
        });

        // Close menu when a link is clicked
        links.addEventListener('click', function (e) {
            if (e.target.tagName === 'A') {
                links.classList.remove('open');
                hamburger.setAttribute('aria-expanded', 'false');
            }
        });

        // Close menu on outside click
        document.addEventListener('click', function (e) {
            if (!nav.contains(e.target)) {
                links.classList.remove('open');
                hamburger.setAttribute('aria-expanded', 'false');
            }
        });
    }
}());

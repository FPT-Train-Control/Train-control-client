// ==================== NAVIGATION ====================
document.addEventListener('DOMContentLoaded', () => {
  const navLinks = document.querySelectorAll('.nav-link:not(.btn-dashboard)');
  
  navLinks.forEach(link => {
    link.addEventListener('click', (e) => {
      navLinks.forEach(l => l.classList.remove('active'));
      link.classList.add('active');
    });
  });

  navLinks[0].classList.add('active');

  window.addEventListener('scroll', () => {
    const sections = document.querySelectorAll('section');
    let current = '';

    sections.forEach(section => {
      const sectionTop = section.offsetTop;
      const sectionHeight = section.clientHeight;
      if (pageYOffset >= sectionTop - 200) {
        current = section.getAttribute('id');
      }
    });

    navLinks.forEach(link => {
      link.classList.remove('active');
      if (link.getAttribute('href').slice(1) === current) {
        link.classList.add('active');
      }
    });
  });

  // Scroll animations
  const observerOptions = {
    threshold: 0.1,
    rootMargin: '0px 0px -100px 0px'
  };

  const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.style.animation = 'fadeIn 0.6s ease forwards';
        observer.unobserve(entry.target);
      }
    });
  }, observerOptions);

  document.querySelectorAll('.feature-card, .contact-card').forEach(card => {
    observer.observe(card);
  });

  // Initialize map dots
  initializeMapDots();
});

// ==================== MAP DOTS ====================
function initializeMapDots() {
  const stations = [
    { name: 'Hà Nội', icon: '🚂', x: 45, y: 15 },
    { name: 'Vinh', icon: '🚂', x: 45, y: 30 },
    { name: 'Huế', icon: '🚂', x: 55, y: 45 },
    { name: 'Quảng Ngãi', icon: '🚂', x: 58, y: 53 },
    { name: 'Nha Trang', icon: '🚂', x: 60, y: 70 },
    { name: 'Hồ Chí Minh', icon: '🚂', x: 50, y: 80 }
  ];

  const mapDotsContainer = document.getElementById('mapDotsContainer');
  
  stations.forEach(station => {
    const dot = document.createElement('a');
    dot.href = '../DashBoard/index.html';
    dot.className = 'map-dot';
    dot.style.left = station.x + '%';
    dot.style.top = station.y + '%';
    dot.innerHTML = `
      ${station.icon}
      <div class="map-dot-tooltip">${station.name}</div>
    `;
    dot.title = `Trạm ${station.name} - Nhấp để vào Hệ Thống Điều Khiển`;
    mapDotsContainer.appendChild(dot);
  });
}

// Add fade-in animation
const style = document.createElement('style');
style.textContent = `
  @keyframes fadeIn {
    from {
      opacity: 0;
      transform: translateY(20px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }
`;
document.head.appendChild(style);

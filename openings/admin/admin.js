/**
 * CapitalSavvy - Admin Dashboard
 */
(function() {
    'use strict';

    const API = 'api.php';
    let currentPage = 1;
    let currentStatus = 'All';
    let currentSearch = '';
    let searchTimer = null;

    // === Init ===
    document.addEventListener('DOMContentLoaded', function() {
        checkAuth();
        initEvents();
    });

    // === Auth ===
    function checkAuth() {
        fetch(API + '?action=check')
            .then(function(r) { return r.json(); })
            .then(function(data) {
                if (data.logged_in) {
                    showDashboard();
                }
            });
    }

    function initEvents() {
        // Login
        document.getElementById('loginForm').addEventListener('submit', function(e) {
            e.preventDefault();
            var fd = new FormData(this);
            fd.append('action', 'login');
            fetch(API, { method: 'POST', body: fd })
                .then(function(r) { return r.json(); })
                .then(function(data) {
                    if (data.success) {
                        showDashboard();
                    } else {
                        var err = document.getElementById('loginError');
                        err.textContent = data.error || 'Invalid credentials';
                        err.style.display = 'block';
                    }
                });
        });

        // Logout
        document.getElementById('logoutBtn').addEventListener('click', function() {
            fetch(API + '?action=logout')
                .then(function() {
                    document.getElementById('loginPage').classList.remove('hidden');
                    document.getElementById('dashboard').classList.remove('active');
                });
        });

        // Search
        document.getElementById('searchInput').addEventListener('input', function() {
            clearTimeout(searchTimer);
            var val = this.value;
            searchTimer = setTimeout(function() {
                currentSearch = val;
                currentPage = 1;
                loadApplications();
            }, 300);
        });

        // Status filter
        document.getElementById('statusFilter').addEventListener('change', function() {
            currentStatus = this.value;
            currentPage = 1;
            loadApplications();
            updateStatCards();
        });

        // Stat cards
        document.querySelectorAll('.stat-card').forEach(function(card) {
            card.addEventListener('click', function() {
                currentStatus = this.dataset.filter;
                currentPage = 1;
                document.getElementById('statusFilter').value = currentStatus;
                loadApplications();
                updateStatCards();
            });
        });

        // Pagination
        document.getElementById('prevPage').addEventListener('click', function() {
            if (currentPage > 1) { currentPage--; loadApplications(); }
        });
        document.getElementById('nextPage').addEventListener('click', function() {
            currentPage++;
            loadApplications();
        });

        // Export CSV
        document.getElementById('exportBtn').addEventListener('click', function() {
            window.location.href = API + '?action=export&status=' + encodeURIComponent(currentStatus);
        });

        // Close detail
        document.getElementById('closeDetail').addEventListener('click', closeDetail);
        document.getElementById('detailOverlay').addEventListener('click', function(e) {
            if (e.target === this) closeDetail();
        });
        document.addEventListener('keydown', function(e) {
            if (e.key === 'Escape') closeDetail();
        });
    }

    function showDashboard() {
        document.getElementById('loginPage').classList.add('hidden');
        document.getElementById('dashboard').classList.add('active');
        loadApplications();
        loadStats();
    }

    // === Load Applications ===
    function loadApplications() {
        var params = '?action=list&page=' + currentPage;
        if (currentStatus !== 'All') params += '&status=' + encodeURIComponent(currentStatus);
        if (currentSearch) params += '&search=' + encodeURIComponent(currentSearch);

        fetch(API + params)
            .then(function(r) { return r.json(); })
            .then(function(data) {
                if (data.error) return;
                renderTable(data.applications);
                renderPagination(data.page, data.pages, data.total);
            });
    }

    function loadStats() {
        // Load counts for each status
        var statuses = ['All', 'New', 'Reviewed', 'Stage 1', 'Offered', 'Rejected'];
        statuses.forEach(function(s) {
            var params = '?action=list&page=1';
            if (s !== 'All') params += '&status=' + encodeURIComponent(s);
            fetch(API + params)
                .then(function(r) { return r.json(); })
                .then(function(data) {
                    var id = 'stat' + s.replace(/\s/g, '');
                    var el = document.getElementById(id);
                    if (el) el.textContent = data.total || 0;
                });
        });
    }

    function updateStatCards() {
        document.querySelectorAll('.stat-card').forEach(function(card) {
            card.classList.toggle('active', card.dataset.filter === currentStatus);
        });
    }

    // === Render Table ===
    function renderTable(apps) {
        var tbody = document.getElementById('appTableBody');
        if (!apps || apps.length === 0) {
            tbody.innerHTML = '<tr><td colspan="6" class="empty-state"><p>No applications found</p></td></tr>';
            return;
        }
        tbody.innerHTML = apps.map(function(app) {
            return '<tr data-id="' + app.id + '">' +
                '<td><div class="app-name">' + esc(app.first_name) + ' ' + esc(app.last_name) + '</div></td>' +
                '<td class="app-email">' + esc(app.email) + '</td>' +
                '<td>' + esc(app.reference_number) + '</td>' +
                '<td>' + statusBadge(app.status) + '</td>' +
                '<td>' + esc(app.years_experience || '-') + '</td>' +
                '<td>' + formatDate(app.created_at) + '</td>' +
                '</tr>';
        }).join('');

        // Row click
        tbody.querySelectorAll('tr[data-id]').forEach(function(row) {
            row.addEventListener('click', function() {
                openDetail(this.dataset.id);
            });
        });
    }

    function statusBadge(status) {
        var cls = 'badge-' + status.toLowerCase().replace(/\s+/g, '');
        return '<span class="badge ' + cls + '">' + esc(status) + '</span>';
    }

    function renderPagination(page, pages, total) {
        document.getElementById('pageInfo').textContent = 'Page ' + page + ' of ' + Math.max(1, pages) + ' (' + total + ' total)';
        document.getElementById('prevPage').disabled = page <= 1;
        document.getElementById('nextPage').disabled = page >= pages;
    }

    // === Detail Panel ===
    function openDetail(id) {
        fetch(API + '?action=get&id=' + id)
            .then(function(r) { return r.json(); })
            .then(function(data) {
                if (data.error) return alert(data.error);
                renderDetail(data.application);
                document.getElementById('detailOverlay').classList.add('active');
            });
    }

    function closeDetail() {
        document.getElementById('detailOverlay').classList.remove('active');
    }

    function renderDetail(app) {
        document.getElementById('detailName').textContent = app.first_name + ' ' + app.last_name;
        document.getElementById('detailRef').textContent = app.reference_number;

        var html = '';

        // Status control
        html += '<div class="detail-section">';
        html += '<h3>Application Status</h3>';
        html += '<select class="status-select" id="detailStatus" data-id="' + app.id + '">' +
            ['New', 'Reviewed', 'Stage 1', 'Stage 2', 'Stage 3', 'Offered', 'Rejected'].map(function(s) {
                return '<option' + (s === app.status ? ' selected' : '') + '>' + s + '</option>';
            }).join('') + '</select>';
        html += '</div>';

        // Personal Info
        html += detailSection('Personal Information', [
            ['Email', app.email],
            ['Phone', app.phone],
            ['Country', app.country],
            ['City', app.city],
            ['Gender', app.gender || 'Not specified'],
            ['Heard About', app.heard_about],
            app.referral_name ? ['Referral', app.referral_name] : null,
            app.heard_other ? ['Other Source', app.heard_other] : null
        ]);

        // Education
        html += detailSection('Education & Background', [
            ['Education', app.education_level],
            ['Institution', app.institution],
            ['Field of Study', app.field_of_study],
            app.field_other ? ['Other Field', app.field_other] : null,
            ['Graduation', app.graduation_year],
            app.expected_graduation ? ['Expected Grad.', app.expected_graduation] : null,
            ['Experience', app.years_experience],
            ['Employment', app.employment_status],
            app.current_role ? ['Current Role', app.current_role] : null
        ]);

        // Skills
        var skills = [
            ['Figma', app.skill_figma], ['React.js', app.skill_react],
            ['JavaScript', app.skill_javascript], ['HTML/CSS', app.skill_html_css],
            ['TypeScript', app.skill_typescript], ['Next.js', app.skill_nextjs],
            ['Tailwind', app.skill_tailwind], ['Git/GitHub', app.skill_git],
            ['REST APIs', app.skill_rest_api], ['State Mgmt', app.skill_state_mgmt]
        ];
        html += detailSection('Technical Skills', skills);

        // Portfolio
        html += detailSection('Portfolio & Links', [
            ['GitHub', app.github_url ? '<a href="' + esc(app.github_url) + '" target="_blank">' + esc(app.github_url) + '</a>' : '-'],
            ['Figma', app.figma_url ? '<a href="' + esc(app.figma_url) + '" target="_blank">' + esc(app.figma_url) + '</a>' : '-'],
            ['Portfolio', app.portfolio_url ? '<a href="' + esc(app.portfolio_url) + '" target="_blank">' + esc(app.portfolio_url) + '</a>' : '-'],
            ['LinkedIn', app.linkedin_url ? '<a href="' + esc(app.linkedin_url) + '" target="_blank">' + esc(app.linkedin_url) + '</a>' : '-'],
            ['Best Project', app.best_project_url ? '<a href="' + esc(app.best_project_url) + '" target="_blank">Link</a>' : '-'],
            ['Description', app.best_project_desc]
        ]);

        // Motivation
        html += detailSection('Motivation & Culture Fit', [
            ['Why CapitalSavvy', app.why_capitalsavvy],
            ['Learning Approach', app.learn_new_tech],
            ['Good Design', app.good_design || '-'],
            ['Feedback', app.handle_feedback],
            ['Fintech Future', app.future_fintech || '-'],
            ['Hybrid Pref.', app.hybrid_preference],
            ['Start Date', app.start_date],
            ['Salary Range', app.salary_range]
        ]);

        // Files
        html += '<div class="detail-section"><h3>Uploaded Files</h3>';
        [['CV', app.cv_path], ['Cover Letter', app.cover_letter_path], ['Design Portfolio', app.design_portfolio_path], ['Additional', app.additional_samples_path]].forEach(function(f) {
            if (f[1]) {
                html += '<a href="' + API + '?action=download&path=' + encodeURIComponent(f[1]) + '" class="file-link" target="_blank">&#128196; ' + esc(f[0]) + ' &mdash; ' + esc(f[1].split('/').pop()) + '</a><br>';
            }
        });
        html += '</div>';

        // Internal Notes
        html += '<div class="detail-section"><h3>Internal Notes</h3>';
        if (app.internal_notes) {
            html += '<div class="notes-existing" id="existingNotes">' + esc(app.internal_notes) + '</div>';
        }
        html += '<textarea class="notes-area" id="newNote" placeholder="Add a note..."></textarea>';
        html += '<button class="small-btn small-btn-gold" id="addNoteBtn" data-id="' + app.id + '">Add Note</button>';
        html += '</div>';

        // Danger zone
        html += '<div class="detail-section" style="margin-top:30px;padding-top:16px;border-top:1px solid var(--border);">';
        html += '<button class="small-btn small-btn-danger" id="deleteBtn" data-id="' + app.id + '">Delete Application</button>';
        html += '</div>';

        document.getElementById('detailBody').innerHTML = html;

        // Wire events
        document.getElementById('detailStatus').addEventListener('change', function() {
            var fd = new FormData();
            fd.append('action', 'update_status');
            fd.append('id', this.dataset.id);
            fd.append('status', this.value);
            fetch(API, { method: 'POST', body: fd })
                .then(function(r) { return r.json(); })
                .then(function() { loadApplications(); loadStats(); });
        });

        document.getElementById('addNoteBtn').addEventListener('click', function() {
            var note = document.getElementById('newNote').value.trim();
            if (!note) return;
            var fd = new FormData();
            fd.append('action', 'add_note');
            fd.append('id', this.dataset.id);
            fd.append('note', note);
            fetch(API, { method: 'POST', body: fd })
                .then(function(r) { return r.json(); })
                .then(function(data) {
                    if (data.success) {
                        var existing = document.getElementById('existingNotes');
                        if (existing) {
                            existing.textContent = data.notes;
                        } else {
                            var ne = document.createElement('div');
                            ne.className = 'notes-existing';
                            ne.id = 'existingNotes';
                            ne.textContent = data.notes;
                            document.getElementById('newNote').before(ne);
                        }
                        document.getElementById('newNote').value = '';
                    }
                });
        });

        document.getElementById('deleteBtn').addEventListener('click', function() {
            if (!confirm('Are you sure you want to permanently delete this application? This cannot be undone.')) return;
            var fd = new FormData();
            fd.append('action', 'delete');
            fd.append('id', this.dataset.id);
            fetch(API, { method: 'POST', body: fd })
                .then(function(r) { return r.json(); })
                .then(function(data) {
                    if (data.success) {
                        closeDetail();
                        loadApplications();
                        loadStats();
                    }
                });
        });
    }

    function detailSection(title, rows) {
        var html = '<div class="detail-section"><h3>' + title + '</h3>';
        rows.forEach(function(row) {
            if (!row) return;
            var val = row[1] || '-';
            // If value contains HTML tags (links), don't escape
            var isHtml = typeof val === 'string' && val.indexOf('<a ') !== -1;
            html += '<div class="detail-row"><div class="detail-label">' + row[0] + '</div><div class="detail-value">' + (isHtml ? val : esc(val)) + '</div></div>';
        });
        html += '</div>';
        return html;
    }

    // === Helpers ===
    function esc(str) {
        if (!str) return '';
        var div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    }

    function formatDate(dateStr) {
        if (!dateStr) return '-';
        var d = new Date(dateStr);
        return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
    }
})();

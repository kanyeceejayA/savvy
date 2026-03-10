/**
 * CapitalSavvy Admin Dashboard — v4
 */
(function () {
    'use strict';

    const API = 'api.php';
    const SORT_MAP = { name: 'first_name', status: 'status', experience: 'years_experience', date: 'created_at', salary: 'salary_range' };
    const EMAIL_TPLS = {
        next_stage: {
            label: 'Next Stage',
            subject: function (ref) { return 'Next Step: CapitalSavvy Application (' + ref + ')'; },
            body: 'We are pleased to invite you to the next stage of our process. We will be in touch with details shortly.'
        },
        on_hold: {
            label: 'On Hold',
            subject: function (ref) { return 'Update: CapitalSavvy Application (' + ref + ')'; },
            body: 'Your application is still under review. We appreciate your patience and continued interest in CapitalSavvy.'
        },
        rejection: {
            label: 'Rejection',
            subject: function (ref) { return 'CapitalSavvy Application Outcome (' + ref + ')'; },
            body: 'Thank you for the time and effort you put into your application. After careful consideration, we are not moving forward at this stage. We value your interest and encourage you to apply in the future.'
        }
    };

    // ── State ─────────────────────────────────────────────────────
    var currentRole   = 'All';
    var currentStatus = 'All';
    var currentSearch = '';
    var currentPage   = 1;
    var totalPages    = 1;
    var sortBy        = 'created_at';
    var sortDir       = 'DESC';
    var showArchived  = false;
    var selectedIds   = new Set();
    var searchTimer   = null;
    var currentDetailApp = null;
    var activeDetailTab  = 'profile';
    var currentUser   = '';
    var emailModalIds   = [];
    var pendingStatusFn = null;
    var columnFilters   = {};
    var filterBarOpen   = false;
    var filterBarLoaded = false;

    // Visible columns (toggleable)
    var colVisible = { role: true, status: true, experience: true, reference: true, applied: true, salary: false, phone: false, education: false, github: false, portfolio: false, linkedin: false };

    // ── Boot ──────────────────────────────────────────────────────
    document.addEventListener('DOMContentLoaded', function () {
        initEvents();
        initColMenu();
        checkAuth();
    });

    // ── Events ────────────────────────────────────────────────────
    function initEvents() {
        // Auth
        document.getElementById('loginForm').addEventListener('submit', onLogin);
        document.getElementById('logoutBtn').addEventListener('click', onLogout);

        // Tab nav
        document.querySelectorAll('.nav-pill').forEach(function (btn) {
            btn.addEventListener('click', function () { switchTab(this.dataset.tab); });
        });

        // Role picker
        document.getElementById('refreshRolesBtn').addEventListener('click', loadRoleStats);
        document.getElementById('backBtn').addEventListener('click', showRolePicker);

        // Archive toggle
        document.getElementById('showArchivedToggle').addEventListener('change', function () {
            showArchived = this.checked;
            document.getElementById('pipArchived').classList.toggle('hidden', !showArchived);
            // Reset to "All" so we don't get stuck on a non-archived-visible filter
            if (!showArchived && currentStatus === 'Archived') {
                currentStatus = 'All';
                syncPipeline();
            }
            currentPage = 1;
            loadStats();
            loadApplications();
        });

        // Pipeline chevrons
        document.getElementById('pipMain').addEventListener('click', function (e) {
            var chev = e.target.closest('.pip-chev');
            if (!chev) return;
            currentStatus = chev.dataset.filter;
            currentPage = 1;
            syncPipeline();
            loadApplications();
        });
        document.querySelectorAll('.pip-pill').forEach(function (pill) {
            pill.addEventListener('click', function () {
                currentStatus = this.dataset.filter;
                currentPage = 1;
                syncPipeline();
                loadApplications();
            });
        });

        // Search
        document.getElementById('searchInput').addEventListener('input', function () {
            clearTimeout(searchTimer);
            var val = this.value;
            searchTimer = setTimeout(function () {
                currentSearch = val.trim();
                currentPage = 1;
                loadApplications();
            }, 280);
        });

        // Sort headers
        document.querySelectorAll('.th-sort').forEach(function (th) {
            th.addEventListener('click', function () {
                var col = this.dataset.sort;
                if (sortBy === SORT_MAP[col]) {
                    sortDir = sortDir === 'DESC' ? 'ASC' : 'DESC';
                } else {
                    sortBy = SORT_MAP[col] || 'created_at';
                    sortDir = 'DESC';
                }
                currentPage = 1;
                updateSortHeaders();
                loadApplications();
            });
        });

        // Select All
        document.getElementById('selectAll').addEventListener('change', function () {
            var checked = this.checked;
            document.querySelectorAll('.row-chk').forEach(function (cb) {
                cb.checked = checked;
                var id = parseInt(cb.dataset.id, 10);
                if (checked) selectedIds.add(id); else selectedIds.delete(id);
            });
            syncRows();
            syncBulkBar();
        });

        // Pagination
        document.getElementById('prevPage').addEventListener('click', function () {
            if (currentPage > 1) { currentPage--; loadApplications(); }
        });
        document.getElementById('nextPage').addEventListener('click', function () {
            if (currentPage < totalPages) { currentPage++; loadApplications(); }
        });

        // Refresh / Export
        document.getElementById('refreshBtn').addEventListener('click', function () { loadStats(); loadApplications(); });
        document.getElementById('exportBtn').addEventListener('click', function () {
            var p = '?action=export&status=' + enc(currentStatus);
            if (currentRole !== 'All') p += '&position=' + enc(currentRole);
            if (showArchived) p += '&show_archived=1';
            window.location.href = API + p;
        });

        // Filter bar
        document.getElementById('filterBtn').addEventListener('click', toggleFilterBar);
        document.getElementById('clearFiltersBtn').addEventListener('click', clearAllFilters);
        document.querySelectorAll('.fb-select').forEach(function (sel) {
            sel.addEventListener('change', function () {
                var col = this.dataset.col;
                if (this.value) { columnFilters[col] = this.value; } else { delete columnFilters[col]; }
                syncFilterBadge();
                currentPage = 1;
                loadApplications();
            });
        });

        // Column menu toggle
        document.getElementById('colMenuBtn').addEventListener('click', function (e) {
            e.stopPropagation();
            document.getElementById('colMenu').classList.toggle('hidden');
        });
        document.addEventListener('click', function (e) {
            if (!document.getElementById('colMenuWrap').contains(e.target)) {
                document.getElementById('colMenu').classList.add('hidden');
            }
        });

        // Bulk bar
        document.getElementById('bulkStatusBtn').addEventListener('click', applyBulkStatus);
        document.getElementById('bulkArchiveBtn').addEventListener('click', archiveSelected);
        document.getElementById('bulkEmailBtn').addEventListener('click', function () {
            openEnhancedEmailModal(Array.from(selectedIds), 'next_stage');
        });
        document.getElementById('clearSelBtn').addEventListener('click', clearSelection);

        // Enhanced email modal
        document.getElementById('closeEmailModal').addEventListener('click', closeEmailModal);
        document.getElementById('cancelEmailModal').addEventListener('click', closeEmailModal);
        document.getElementById('emailModal').addEventListener('click', function (e) { if (e.target === this) closeEmailModal(); });
        document.getElementById('emTemplate').addEventListener('change', updateEmailPreview);
        document.getElementById('emPersonalNote').addEventListener('input', updateEmailPreview);
        document.getElementById('sendEmailModalBtn').addEventListener('click', sendEmailFromModal);

        // Status confirm modal
        document.getElementById('closeStatusConfirm').addEventListener('click', closeStatusConfirm);
        document.getElementById('cancelStatusConfirm').addEventListener('click', closeStatusConfirm);
        document.getElementById('statusConfirmModal').addEventListener('click', function (e) { if (e.target === this) closeStatusConfirm(); });
        document.getElementById('confirmStatusBtn').addEventListener('click', function () {
            if (pendingStatusFn) { var fn = pendingStatusFn; closeStatusConfirm(); fn(); }
        });

        // Detail
        document.getElementById('closeDetail').addEventListener('click', closeDetail);
        document.getElementById('detailOverlay').addEventListener('click', function (e) { if (e.target === this) closeDetail(); });
        document.getElementById('dpTabs').addEventListener('click', function (e) {
            var tab = e.target.closest('.dp-tab');
            if (!tab) return;
            document.querySelectorAll('.dp-tab').forEach(function (t) { t.classList.remove('active'); });
            tab.classList.add('active');
            activeDetailTab = tab.dataset.dtab;
            renderDetailTab(activeDetailTab, currentDetailApp);
        });

        // Preview
        document.getElementById('closePreview').addEventListener('click', closePreview);
        document.getElementById('previewOverlay').addEventListener('click', function (e) { if (e.target === this) closePreview(); });

        // Accounts
        document.getElementById('createAccountForm').addEventListener('submit', createAccount);
        document.getElementById('changePasswordForm').addEventListener('submit', changePassword);

        // Escape key
        document.addEventListener('keydown', function (e) {
            if (e.key === 'Escape') { closeDetail(); closePreview(); closeEmailModal(); closeStatusConfirm(); }
        });
    }

    // ── Column Menu ───────────────────────────────────────────────
    var COL_DEFS = [
        { key: 'role',       label: 'Role' },
        { key: 'status',     label: 'Status' },
        { key: 'experience', label: 'Experience' },
        { key: 'reference',  label: 'Reference' },
        { key: 'applied',    label: 'Applied' },
        { key: 'salary',     label: 'Salary Range' },
        { key: 'phone',      label: 'Phone' },
        { key: 'education',  label: 'Education' },
        { key: 'github',     label: 'GitHub' },
        { key: 'portfolio',  label: 'Portfolio' },
        { key: 'linkedin',   label: 'LinkedIn' }
    ];

    function initColMenu() {
        var menu = document.getElementById('colMenu');
        COL_DEFS.forEach(function (def) {
            var item = document.createElement('label');
            item.className = 'col-menu-item';
            var cb = document.createElement('input');
            cb.type = 'checkbox';
            cb.checked = !!colVisible[def.key];
            cb.dataset.col = def.key;
            cb.addEventListener('change', function () {
                colVisible[def.key] = this.checked;
                applyColVisibility();
            });
            item.appendChild(cb);
            item.appendChild(document.createTextNode(def.label));
            menu.appendChild(item);
        });
        applyColVisibility();
    }

    function applyColVisibility() {
        var table = document.getElementById('appTable');
        COL_DEFS.forEach(function (def) {
            var show = !!colVisible[def.key];
            // th
            var th = table.querySelector('th[data-col="' + def.key + '"]');
            if (th) th.classList.toggle('col-hidden', !show);
            // all tds in that column
            table.querySelectorAll('td[data-col="' + def.key + '"]').forEach(function (td) {
                td.classList.toggle('col-hidden', !show);
            });
        });
    }

    // ── Auth ──────────────────────────────────────────────────────
    function checkAuth() {
        fetch(API + '?action=check')
            .then(function (r) { return r.json(); })
            .then(function (d) {
                if (d.logged_in) { currentUser = d.username || ''; showDashboard(); }
            }).catch(function () {});
    }

    function onLogin(e) {
        e.preventDefault();
        var btn = document.getElementById('loginBtn');
        btn.disabled = true; btn.textContent = 'Signing in…';
        var fd = new FormData(e.target);
        fd.append('action', 'login');
        fetch(API, { method: 'POST', body: fd })
            .then(function (r) { return r.json(); })
            .then(function (d) {
                if (d.success) { currentUser = d.username || ''; showDashboard(); }
                else showLoginError(d.error || 'Invalid credentials');
            })
            .catch(function () { showLoginError('Could not connect. Try again.'); })
            .finally(function () { btn.disabled = false; btn.textContent = 'Sign In'; });
    }

    function onLogout() {
        fetch(API + '?action=logout').finally(function () {
            document.getElementById('loginPage').classList.remove('hidden');
            document.getElementById('dashboard').classList.remove('active');
            selectedIds.clear(); syncBulkBar();
        });
    }

    function showLoginError(msg) {
        var el = document.getElementById('loginError');
        el.textContent = msg; el.style.display = 'block';
    }

    function showDashboard() {
        document.getElementById('loginPage').classList.add('hidden');
        document.getElementById('dashboard').classList.add('active');
        if (currentUser) document.getElementById('appbarUser').textContent = currentUser;
        showRolePicker();
        loadAccounts();
    }

    // ── Tab Switch ────────────────────────────────────────────────
    function switchTab(tab) {
        document.querySelectorAll('.nav-pill').forEach(function (b) { b.classList.toggle('active', b.dataset.tab === tab); });
        document.getElementById('applicationsTab').classList.toggle('active', tab === 'applications');
        document.getElementById('accountsTab').classList.toggle('active', tab === 'accounts');
        if (tab === 'accounts') loadAccounts();
    }

    // ── View Navigation ───────────────────────────────────────────
    function showRolePicker() {
        document.getElementById('rolePickerView').classList.remove('hidden');
        document.getElementById('applicantsView').classList.add('hidden');
        loadRoleStats();
    }

    function selectRole(roleName) {
        currentRole = roleName;
        currentStatus = 'All';
        currentSearch = '';
        currentPage = 1;
        document.getElementById('searchInput').value = '';
        document.getElementById('avRoleName').textContent = roleName;
        document.getElementById('rolePickerView').classList.add('hidden');
        document.getElementById('applicantsView').classList.remove('hidden');
        loadStats();
        loadApplications();
    }

    // ── Role Picker ───────────────────────────────────────────────
    function loadRoleStats() {
        var grid = document.getElementById('roleGrid');
        grid.innerHTML = '<div class="tbl-empty">Loading roles…</div>';
        fetch(API + '?action=role_stats')
            .then(function (r) { return r.json(); })
            .then(function (d) {
                if (!Array.isArray(d.roles) || d.roles.length === 0) {
                    grid.innerHTML = '<div class="tbl-empty">No roles found. Applications will appear here once submitted.</div>';
                    return;
                }
                renderRoleCards(d.roles);
            })
            .catch(function (err) { grid.innerHTML = '<div class="tbl-empty" style="color:var(--danger)">Could not load roles: ' + esc(err.message) + '</div>'; });
    }

    function renderRoleCards(roles) {
        var grid = document.getElementById('roleGrid');
        grid.innerHTML = roles.map(function (r) {
            var chips = '';
            if (r.new)      chips += '<span class="role-stat-chip chip-new">' + r.new + ' new</span>';
            if (r.stages)   chips += '<span class="role-stat-chip chip-progress">' + r.stages + ' reviewing</span>';
            if (r.offered)  chips += '<span class="role-stat-chip chip-offered">' + r.offered + ' offered</span>';
            if (r.rejected) chips += '<span class="role-stat-chip chip-rejected">' + r.rejected + ' rejected</span>';
            if (r.archived) chips += '<span class="role-stat-chip chip-archived">' + r.archived + ' archived</span>';
            return '<div class="role-card" data-role="' + esc(r.name) + '">' +
                '<div class="role-card-name">' + esc(r.name) + '</div>' +
                '<div class="role-card-total">' + r.active + '</div>' +
                '<div class="role-card-label">Active applicants</div>' +
                '<div class="role-card-bar">' + (chips || '<span style="color:var(--muted);font-size:.8rem">No active applicants</span>') + '</div>' +
                '<div class="role-card-cta">View applicants →</div>' +
                '</div>';
        }).join('');

        grid.querySelectorAll('.role-card').forEach(function (card) {
            card.addEventListener('click', function () { selectRole(this.dataset.role); });
        });
    }

    // ── Stats ─────────────────────────────────────────────────────
    function loadStats() {
        var p = '?action=stats';
        if (currentRole !== 'All') p += '&position=' + enc(currentRole);
        if (showArchived) p += '&show_archived=1';
        fetch(API + p)
            .then(function (r) { return r.json(); })
            .then(function (d) {
                if (!d.counts) return;
                var map = {
                    All: 'statAll', New: 'statNew', Reviewed: 'statReviewed',
                    'Stage 1': 'statStage1', 'Stage 2': 'statStage2', 'Stage 3': 'statStage3',
                    Offered: 'statOffered', Rejected: 'statRejected', Archived: 'statArchived'
                };
                Object.keys(map).forEach(function (k) {
                    var el = document.getElementById(map[k]);
                    if (el) el.textContent = d.counts[k] !== undefined ? d.counts[k] : '0';
                });
                // Update applicants view header count
                var countEl = document.getElementById('avRoleCount');
                if (countEl) countEl.textContent = (d.counts['All'] || 0) + ' applicant' + (d.counts['All'] === 1 ? '' : 's');
            });
    }

    function syncPipeline() {
        document.querySelectorAll('.pip-chev, .pip-pill').forEach(function (el) {
            el.classList.toggle('active', el.dataset.filter === currentStatus);
        });
    }

    // ── Applications ──────────────────────────────────────────────
    function loadApplications() {
        var p = '?action=list&page=' + currentPage + '&sort_by=' + enc(sortBy) + '&sort_dir=' + enc(sortDir);
        if (currentStatus !== 'All') p += '&status=' + enc(currentStatus);
        if (currentRole !== 'All')   p += '&position=' + enc(currentRole);
        if (currentSearch)           p += '&search=' + enc(currentSearch);
        if (showArchived)            p += '&show_archived=1';
        Object.keys(columnFilters).forEach(function (k) {
            if (columnFilters[k]) p += '&filter_' + enc(k) + '=' + enc(columnFilters[k]);
        });

        document.getElementById('appTableBody').innerHTML = '<tr><td colspan="13" class="tbl-empty">Loading…</td></tr>';

        fetch(API + p)
            .then(function (r) {
                if (r.status === 401) throw new Error('Session expired. Please sign in again.');
                return r.json();
            })
            .then(function (d) {
                if (d.error) throw new Error(d.error);
                renderTable(d.applications || []);
                renderPagination(d.page || 1, d.pages || 1, d.total || 0);
            })
            .catch(function (err) {
                document.getElementById('appTableBody').innerHTML =
                    '<tr><td colspan="13" class="tbl-empty" style="color:var(--danger)">' + esc(err.message || 'Failed to load.') + '</td></tr>';
                toast(err.message || 'Failed to load applications.', 'err');
            });
    }

    function renderTable(apps) {
        var tbody = document.getElementById('appTableBody');
        if (!apps.length) {
            tbody.innerHTML = '<tr><td colspan="13" class="tbl-empty">No applications found.</td></tr>';
            return;
        }
        tbody.innerHTML = apps.map(function (app) {
            var checked   = selectedIds.has(Number(app.id));
            var initials  = ini(app.first_name, app.last_name);
            var roleTxt   = app.position || 'Frontend Developer';
            var isArchived = app.status === 'Archived';
            return '<tr class="app-row' + (isArchived ? ' row-archived' : '') + '" data-id="' + app.id + '">' +
                '<td class="th-chk"><label class="chk-wrap"><input type="checkbox" class="row-chk" data-id="' + app.id + '"' + (checked ? ' checked' : '') + '><span class="chk-box"></span></label></td>' +
                '<td><div class="app-cell">' +
                    '<div class="app-avatar">' + initials + '</div>' +
                    '<div><div class="app-name">' + esc(app.first_name) + ' ' + esc(app.last_name) + '</div>' +
                    '<div class="app-email">' + esc(app.email) + '</div></div>' +
                '</div></td>' +
                '<td data-col="role"><span class="badge-role">' + esc(roleTxt) + '</span></td>' +
                '<td data-col="status">' + statusBadge(app.status) + '</td>' +
                '<td data-col="experience">' + esc(app.years_experience || '—') + '</td>' +
                '<td data-col="reference" style="font-size:.77rem;color:var(--muted);font-family:monospace">' + esc(app.reference_number) + '</td>' +
                '<td data-col="applied" style="font-size:.8rem;color:var(--muted)">' + fmtDate(app.created_at) + '</td>' +
                '<td data-col="salary">' + esc(app.salary_range || '—') + '</td>' +
                '<td data-col="phone">' + esc(app.phone || '—') + '</td>' +
                '<td data-col="education">' + esc(app.education_level || '—') + '</td>' +
                '<td data-col="github">' + shortLink(app.github_url) + '</td>' +
                '<td data-col="portfolio">' + shortLink(app.portfolio_url) + '</td>' +
                '<td data-col="linkedin">' + shortLink(app.linkedin_url) + '</td>' +
                '</tr>';
        }).join('');

        tbody.querySelectorAll('.row-chk').forEach(function (cb) {
            cb.addEventListener('click', function (e) { e.stopPropagation(); });
            cb.addEventListener('change', function () {
                var id = parseInt(this.dataset.id, 10);
                if (this.checked) selectedIds.add(id); else selectedIds.delete(id);
                syncRows(); syncBulkBar();
            });
        });
        tbody.querySelectorAll('.app-row').forEach(function (row) {
            row.addEventListener('click', function (e) {
                if (e.target.closest('.chk-wrap')) return;
                openDetail(this.dataset.id);
            });
        });

        syncRows();
        syncBulkBar();
        applyColVisibility();
    }

    function syncRows() {
        document.querySelectorAll('.app-row').forEach(function (row) {
            var id = parseInt(row.dataset.id, 10);
            row.classList.toggle('row-selected', selectedIds.has(id));
        });
        var all     = document.querySelectorAll('.row-chk');
        var checked = document.querySelectorAll('.row-chk:checked');
        var sa = document.getElementById('selectAll');
        sa.checked = all.length > 0 && checked.length === all.length;
        sa.indeterminate = checked.length > 0 && checked.length < all.length;
    }

    function renderPagination(page, pages, total) {
        totalPages = pages;
        document.getElementById('pageInfo').textContent = 'Page ' + page + ' of ' + Math.max(1, pages) + ' (' + total + ' total)';
        document.getElementById('prevPage').disabled = page <= 1;
        document.getElementById('nextPage').disabled = page >= pages;
    }

    // ── Sort ──────────────────────────────────────────────────────
    function updateSortHeaders() {
        document.querySelectorAll('.th-sort').forEach(function (th) {
            var mapped = SORT_MAP[th.dataset.sort] || '';
            th.classList.remove('sort-asc', 'sort-desc');
            if (mapped === sortBy) th.classList.add(sortDir === 'ASC' ? 'sort-asc' : 'sort-desc');
            var ico = th.querySelector('.sort-ico');
            if (ico) {
                if (mapped !== sortBy) ico.textContent = '↕';
                else ico.textContent = sortDir === 'ASC' ? '↑' : '↓';
            }
        });
    }

    // ── Bulk Actions ──────────────────────────────────────────────
    function syncBulkBar() {
        var count = selectedIds.size;
        document.getElementById('bulkCount').textContent = count;
        document.getElementById('bulkBar').classList.toggle('hidden', count === 0);
    }

    function clearSelection() {
        selectedIds.clear();
        document.querySelectorAll('.row-chk').forEach(function (cb) { cb.checked = false; });
        var sa = document.getElementById('selectAll');
        sa.checked = false; sa.indeterminate = false;
        syncRows(); syncBulkBar();
    }

    function applyBulkStatus() {
        var status = document.getElementById('bulkStatus').value;
        if (!status) { toast('Choose a target stage first.', 'warn'); return; }
        if (selectedIds.size === 0) { toast('No applicants selected.', 'warn'); return; }
        bulkStatusUpdate(status);
    }

    function archiveSelected() {
        if (selectedIds.size === 0) { toast('No applicants selected.', 'warn'); return; }
        if (!confirm('Archive ' + selectedIds.size + ' applicant(s)? They will be hidden from the main view.')) return;
        bulkStatusUpdate('Archived');
    }

    function bulkStatusUpdate(status) {
        var fd = new FormData();
        fd.append('action', 'bulk_update_status');
        fd.append('status', status);
        fd.append('ids', JSON.stringify(Array.from(selectedIds)));
        fetch(API, { method: 'POST', body: fd })
            .then(function (r) { return r.json(); })
            .then(function (d) {
                if (d.success) {
                    toast('Moved ' + d.updated + ' to ' + status + '.', 'ok');
                    clearSelection(); loadApplications(); loadStats();
                } else toast(d.error || 'Could not update.', 'err');
            }).catch(function () { toast('Request failed.', 'err'); });
    }

    // ── Enhanced Email Modal ───────────────────────────────────────
    function openEnhancedEmailModal(ids, defaultTemplate) {
        emailModalIds = ids || [];
        document.getElementById('emTemplate').value = defaultTemplate || 'next_stage';
        document.getElementById('emPersonalNote').value = '';
        document.getElementById('emCount').textContent = emailModalIds.length;
        updateEmailRecipients();
        updateEmailPreview();
        document.getElementById('emailModal').classList.remove('hidden');
    }

    function closeEmailModal() {
        document.getElementById('emailModal').classList.add('hidden');
        emailModalIds = [];
    }

    function updateEmailRecipients() {
        var el = document.getElementById('emRecipients');
        var ids = emailModalIds;
        if (!ids.length) { el.innerHTML = '<span style="color:var(--muted)">No recipients</span>'; return; }
        var names = [];
        ids.forEach(function (id) {
            if (currentDetailApp && Number(currentDetailApp.id) === id) {
                names.push(currentDetailApp.first_name + ' ' + currentDetailApp.last_name);
            } else {
                var row = document.querySelector('.app-row[data-id="' + id + '"]');
                if (row) { var n = row.querySelector('.app-name'); if (n) names.push(n.textContent); }
            }
        });
        var chips = names.length ? names.slice(0, 4).map(function (n) {
            return '<span class="em-recipient-chip">' + esc(n) + '</span>';
        }).join('') : '<span class="em-recipient-chip">' + ids.length + ' applicant' + (ids.length > 1 ? 's' : '') + '</span>';
        if (names.length > 4) chips += '<span class="em-recipient-more">+' + (names.length - 4) + ' more</span>';
        el.innerHTML = chips;
    }

    function updateEmailPreview() {
        var key = document.getElementById('emTemplate').value;
        var tpl = EMAIL_TPLS[key] || EMAIL_TPLS['next_stage'];
        var note = document.getElementById('emPersonalNote').value.trim();
        var recipientName = 'Applicant';
        var ref = 'CS-FD-XXXXXX';
        if (currentDetailApp && emailModalIds.length === 1 && emailModalIds[0] === Number(currentDetailApp.id)) {
            recipientName = currentDetailApp.first_name;
            ref = currentDetailApp.reference_number || ref;
        }
        var noteHtml = note ? '<p class="em-preview-note">' + esc(note).replace(/\n/g, '<br>') + '</p>' : '';
        document.getElementById('emPreview').innerHTML =
            '<div class="em-preview-subject"><span class="em-preview-label">Subject</span> ' + esc(tpl.subject(ref)) + '</div>' +
            '<div class="em-preview-body">' +
                '<p>Dear ' + esc(recipientName) + ',</p>' +
                '<p>' + esc(tpl.body) + '</p>' +
                noteHtml +
                '<p>Reference: <strong>' + esc(ref) + '</strong></p>' +
                '<p style="color:var(--muted)">Regards,<br>CapitalSavvy Team</p>' +
            '</div>';
    }

    function sendEmailFromModal() {
        if (!emailModalIds.length) { toast('No recipients.', 'warn'); return; }
        var template = document.getElementById('emTemplate').value;
        var personalNote = document.getElementById('emPersonalNote').value.trim();
        var btn = document.getElementById('sendEmailModalBtn');
        btn.disabled = true; btn.textContent = 'Sending…';
        var fd = new FormData();
        fd.append('action', 'bulk_email');
        fd.append('ids', JSON.stringify(emailModalIds));
        fd.append('template', template);
        fd.append('subject', '');
        fd.append('body', '');
        fd.append('personal_note', personalNote);
        fetch(API, { method: 'POST', body: fd })
            .then(function (r) { return r.json(); })
            .then(function (d) {
                if (d.success) {
                    var msg = 'Sent to ' + d.sent + ' applicant' + (d.sent !== 1 ? 's' : '') + '.';
                    if (d.failed && d.failed.length) msg += ' Failed: ' + d.failed.join(', ');
                    toast(msg, 'ok');
                    closeEmailModal();
                    // Refresh emails tab if open
                    if (currentDetailApp && activeDetailTab === 'emails') loadEmailLog(currentDetailApp.id);
                } else toast(d.error || 'Could not send.', 'err');
            })
            .catch(function () { toast('Request failed.', 'err'); })
            .finally(function () {
                btn.disabled = false;
                btn.innerHTML = 'Send to <span id="emCount">' + emailModalIds.length + '</span> applicant' + (emailModalIds.length !== 1 ? 's' : '');
            });
    }

    // ── Filter Bar ────────────────────────────────────────────────
    function toggleFilterBar() {
        filterBarOpen = !filterBarOpen;
        document.getElementById('filterBar').classList.toggle('hidden', !filterBarOpen);
        if (filterBarOpen && !filterBarLoaded) {
            filterBarLoaded = true;
            loadFilterOptions();
        }
    }

    function loadFilterOptions() {
        var cols = ['years_experience', 'education_level', 'salary_range', 'employment_status', 'gender', 'country', 'heard_about'];
        cols.forEach(function (col) {
            fetch(API + '?action=distinct_values&col=' + enc(col))
                .then(function (r) { return r.json(); })
                .then(function (d) {
                    if (!d.values) return;
                    var sel = document.getElementById('fb_' + col);
                    if (!sel) return;
                    var cur = columnFilters[col] || '';
                    d.values.forEach(function (v) {
                        var opt = document.createElement('option');
                        opt.value = v;
                        opt.textContent = v;
                        if (v === cur) opt.selected = true;
                        sel.appendChild(opt);
                    });
                });
        });
    }

    function clearAllFilters() {
        columnFilters = {};
        document.querySelectorAll('.fb-select').forEach(function (sel) { sel.value = ''; });
        syncFilterBadge();
        currentPage = 1;
        loadApplications();
    }

    function syncFilterBadge() {
        var count = Object.keys(columnFilters).length;
        var badge = document.getElementById('filterBadge');
        badge.textContent = count;
        badge.classList.toggle('hidden', count === 0);
        document.getElementById('filterBtn').classList.toggle('btn-gold', count > 0);
        document.getElementById('filterBtn').classList.toggle('btn-outline', count === 0);
        document.querySelectorAll('.fb-select').forEach(function (sel) {
            sel.classList.toggle('is-active', !!sel.value);
        });
    }

    // ── Status Confirm ─────────────────────────────────────────────
    function confirmStatus(appName, newStatus, onConfirm) {
        pendingStatusFn = onConfirm;
        document.getElementById('statusConfirmMsg').innerHTML =
            'Move <strong>' + esc(appName) + '</strong> to <strong>' + esc(newStatus) + '</strong>?';
        document.getElementById('statusConfirmModal').classList.remove('hidden');
    }

    function closeStatusConfirm() {
        document.getElementById('statusConfirmModal').classList.add('hidden');
        pendingStatusFn = null;
    }

    // ── Application Detail ─────────────────────────────────────────
    function openDetail(id) {
        fetch(API + '?action=get&id=' + id)
            .then(function (r) {
                if (r.status === 401) throw new Error('Session expired.');
                return r.json();
            })
            .then(function (d) {
                if (d.error || !d.application) { toast(d.error || 'Not found.', 'err'); return; }
                currentDetailApp = d.application;
                renderDetailHeader(currentDetailApp);
                renderDetailPipeline(currentDetailApp);
                activeDetailTab = 'profile';
                document.querySelectorAll('.dp-tab').forEach(function (t) { t.classList.remove('active'); });
                var first = document.querySelector('.dp-tab[data-dtab="profile"]');
                if (first) first.classList.add('active');
                renderDetailTab('profile', currentDetailApp);
                document.getElementById('detailOverlay').classList.remove('hidden');
            })
            .catch(function (err) { toast(err.message, 'err'); });
    }

    function closeDetail() {
        document.getElementById('detailOverlay').classList.add('hidden');
        currentDetailApp = null;
        closeStatusConfirm();
    }

    function renderDetailHeader(app) {
        document.getElementById('dpAvatar').textContent = ini(app.first_name, app.last_name);
        document.getElementById('detailName').textContent = app.first_name + ' ' + app.last_name;
        document.getElementById('detailRef').textContent = app.reference_number + (app.position ? ' · ' + app.position : '');
    }

    function renderDetailPipeline(app) {
        var main = ['New', 'Reviewed', 'Stage 1', 'Stage 2', 'Stage 3', 'Offered'];
        var html = '';
        main.forEach(function (st, i) {
            var active = app.status === st;
            html += '<div class="dp-stage">' +
                '<button class="dp-stage-btn' + (active ? ' is-active' : '') + '" data-id="' + app.id + '" data-status="' + esc(st) + '">' + esc(st) + '</button>' +
                (i < main.length - 1 ? '<div class="dp-stage-arrow">›</div>' : '') +
                '</div>';
        });
        // Rejected + Archived at the end, separated
        html += '<div class="dp-stage" style="margin-left:auto;gap:6px;display:flex">' +
            '<button class="dp-stage-btn' + (app.status === 'Rejected' ? ' is-danger' : '') + '" data-id="' + app.id + '" data-status="Rejected">Rejected</button>' +
            '<button class="dp-stage-btn' + (app.status === 'Archived' ? ' is-archive' : '') + '" data-id="' + app.id + '" data-status="Archived">Archive</button>' +
            '</div>';

        var container = document.getElementById('dpPipeline');
        container.innerHTML = html;
        container.querySelectorAll('.dp-stage-btn').forEach(function (btn) {
            btn.addEventListener('click', function () {
                var newStatus = this.dataset.status;
                var appId = this.dataset.id;
                var appName = (currentDetailApp ? currentDetailApp.first_name + ' ' + currentDetailApp.last_name : 'this applicant');
                confirmStatus(appName, newStatus, function () {
                    var fd = new FormData();
                    fd.append('action', 'update_status');
                    fd.append('id', appId);
                    fd.append('status', newStatus);
                    fetch(API, { method: 'POST', body: fd })
                        .then(function (r) { return r.json(); })
                        .then(function (d) {
                            if (!d.success) { toast(d.error || 'Update failed.', 'err'); return; }
                            if (currentDetailApp) {
                                currentDetailApp.status = newStatus;
                                renderDetailPipeline(currentDetailApp);
                            }
                            loadApplications(); loadStats();
                            toastWithAction(
                                'Moved to ' + newStatus + '.',
                                'Notify applicant',
                                function () { openEnhancedEmailModal([parseInt(appId, 10)], newStatus === 'Rejected' ? 'rejection' : 'next_stage'); }
                            );
                        })
                        .catch(function () { toast('Request failed.', 'err'); });
                });
            });
        });
    }

    function renderDetailTab(tab, app) {
        var body = document.getElementById('detailBody');
        if (!app) { body.innerHTML = ''; return; }
        var html = '';
        switch (tab) {
            case 'profile':
                html += sec('Personal', [
                    ['Email', app.email], ['Phone', app.phone], ['Country', app.country],
                    ['City', app.city], ['Gender', app.gender || '—'], ['Heard Via', app.heard_about],
                    app.referral_name ? ['Referral', app.referral_name] : null,
                    app.heard_other   ? ['Other Source', app.heard_other] : null
                ]);
                html += sec('Education', [
                    ['Level', app.education_level], ['Institution', app.institution],
                    ['Field', app.field_of_study],
                    app.field_other ? ['Field (Other)', app.field_other] : null,
                    ['Graduation', app.graduation_year],
                    app.expected_graduation ? ['Expected Graduation', app.expected_graduation] : null
                ]);
                html += sec('Work', [
                    ['Experience', app.years_experience], ['Employment', app.employment_status],
                    app.current_role ? ['Current Role', app.current_role] : null
                ]);
                html += renderSkillRadar(app);
                break;
            case 'portfolio':
                html += sec('Links', [
                    ['GitHub', lnk(app.github_url)], ['Figma', lnk(app.figma_url)],
                    ['Portfolio', lnk(app.portfolio_url)], ['LinkedIn', lnk(app.linkedin_url)],
                    ['Best Project', lnk(app.best_project_url)]
                ]);
                html += sec('Best Project', [['Description', app.best_project_desc]]);
                break;
            case 'motivation':
                html += sec('Motivation', [
                    ['Why CapitalSavvy', app.why_capitalsavvy], ['Learning New Tech', app.learn_new_tech],
                    ['Good Design', app.good_design || '—'], ['Handling Feedback', app.handle_feedback],
                    ['Fintech Future', app.future_fintech || '—'], ['Hybrid Pref.', app.hybrid_preference],
                    ['Start Date', app.start_date], ['Salary Range', app.salary_range]
                ]);
                break;
            case 'files':
                html += renderFiles(app);
                break;
            case 'notes':
                html += renderNotes(app);
                break;
            case 'emails':
                html = '<div class="dp-section"><h4>Emails Sent</h4><div class="email-log" id="emailLogList"><p style="color:var(--muted);font-size:.85rem">Loading…</p></div></div>';
                break;
        }
        body.innerHTML = html;
        wireDetailBody(app.id);
        if (tab === 'emails') loadEmailLog(app.id);
    }

    function wireDetailBody(appId) {
        // File previews
        document.querySelectorAll('.file-btn').forEach(function (btn) {
            btn.addEventListener('click', function () {
                var url  = this.dataset.preview;
                var dl   = this.dataset.download;
                var name = this.dataset.filename;
                document.getElementById('previewTitle').textContent = name;
                document.getElementById('previewDownloadBtn').href = dl;
                fetch(url).then(function (res) {
                    if (!res.ok) throw new Error('Unsupported');
                    var ct = (res.headers.get('Content-Type') || '').toLowerCase();
                    if (ct.includes('application/pdf')) {
                        document.getElementById('previewBody').innerHTML = '<iframe src="' + url + '"></iframe>';
                    } else if (ct.includes('image/')) {
                        document.getElementById('previewBody').innerHTML = '<img alt="Preview" src="' + url + '">';
                    } else throw new Error('Unsupported type');
                    document.getElementById('previewOverlay').classList.remove('hidden');
                }).catch(function () {
                    document.getElementById('previewBody').innerHTML = '<div class="no-preview">Preview not available. Use Download.</div>';
                    document.getElementById('previewOverlay').classList.remove('hidden');
                });
            });
        });

        // Add note
        var addNoteBtn = document.getElementById('addNoteBtn');
        if (addNoteBtn) {
            addNoteBtn.addEventListener('click', function () {
                var note = document.getElementById('newNote').value.trim();
                if (!note) return;
                var fd = new FormData();
                fd.append('action', 'add_note'); fd.append('id', appId); fd.append('note', note);
                fetch(API, { method: 'POST', body: fd }).then(function (r) { return r.json(); })
                    .then(function (d) {
                        if (!d.success) { toast(d.error || 'Could not save note.', 'err'); return; }
                        currentDetailApp.internal_notes = d.notes;
                        document.getElementById('newNote').value = '';
                        var log = document.getElementById('notesLog');
                        if (log) log.textContent = d.notes;
                        else {
                            var div = document.createElement('div');
                            div.className = 'notes-log'; div.id = 'notesLog'; div.textContent = d.notes;
                            document.getElementById('newNote').before(div);
                        }
                        toast('Note saved.', 'ok');
                    }).catch(function () { toast('Request failed.', 'err'); });
            });
        }

        // Delete
        var delBtn = document.getElementById('deleteAppBtn');
        if (delBtn) {
            delBtn.addEventListener('click', function () {
                if (!confirm('Permanently delete this application? This cannot be undone.')) return;
                var fd = new FormData();
                fd.append('action', 'delete'); fd.append('id', appId);
                fetch(API, { method: 'POST', body: fd }).then(function (r) { return r.json(); })
                    .then(function (d) {
                        if (!d.success) { toast(d.error || 'Delete failed.', 'err'); return; }
                        toast('Application deleted.', 'ok');
                        closeDetail();
                        selectedIds.delete(Number(appId)); syncBulkBar();
                        loadApplications(); loadStats();
                    }).catch(function () { toast('Request failed.', 'err'); });
            });
        }
    }

    function renderSkillRadar(app) {
        var skills = [
            { key: 'skill_figma',       label: 'Figma' },
            { key: 'skill_react',       label: 'React' },
            { key: 'skill_javascript',  label: 'JavaScript' },
            { key: 'skill_html_css',    label: 'HTML/CSS' },
            { key: 'skill_typescript',  label: 'TypeScript' },
            { key: 'skill_nextjs',      label: 'Next.js' },
            { key: 'skill_tailwind',    label: 'Tailwind' },
            { key: 'skill_git',         label: 'Git' },
            { key: 'skill_rest_api',    label: 'REST API' },
            { key: 'skill_state_mgmt',  label: 'State Mgmt' }
        ];
        var levelMap = { 'No experience': 0, 'Beginner': 1, 'Comfortable': 2, 'Proficient': 3, 'Advanced': 4 };
        var n = skills.length;
        var cx = 160, cy = 160, R = 95;

        function pt(i, frac) {
            var angle = i * (2 * Math.PI / n) - Math.PI / 2;
            return {
                x: parseFloat((cx + frac * R * Math.cos(angle)).toFixed(2)),
                y: parseFloat((cy + frac * R * Math.sin(angle)).toFixed(2))
            };
        }

        // Grid rings
        var rings = '';
        [0.25, 0.5, 0.75, 1].forEach(function (frac) {
            var pts = skills.map(function (_, i) { var p = pt(i, frac); return p.x + ',' + p.y; }).join(' ');
            rings += '<polygon points="' + pts + '" fill="none" stroke="#dde3ef" stroke-width="1"/>';
        });

        // Axes
        var axes = '';
        skills.forEach(function (_, i) {
            var p = pt(i, 1);
            axes += '<line x1="' + cx + '" y1="' + cy + '" x2="' + p.x + '" y2="' + p.y + '" stroke="#dde3ef" stroke-width="1"/>';
        });

        // Data polygon & dots
        var dataPoints = skills.map(function (s, i) {
            var level = levelMap[app[s.key]] !== undefined ? levelMap[app[s.key]] : 0;
            return pt(i, level / 4);
        });
        var dataPoly = dataPoints.map(function (p) { return p.x + ',' + p.y; }).join(' ');
        var dots = dataPoints.map(function (p) {
            return '<circle cx="' + p.x + '" cy="' + p.y + '" r="3" fill="#1a6ec0" stroke="#fff" stroke-width="1.5"/>';
        }).join('');

        // Labels
        var labels = '';
        skills.forEach(function (s, i) {
            var p = pt(i, 1.35);
            var anchor = Math.abs(p.x - cx) < 6 ? 'middle' : (p.x > cx ? 'start' : 'end');
            labels += '<text x="' + p.x + '" y="' + (p.y + 4) + '" text-anchor="' + anchor +
                '" font-size="10" fill="#4a5a7a" font-family="Arial,sans-serif">' + s.label + '</text>';
        });

        var svg = '<svg width="100%" viewBox="0 0 320 320" style="display:block;max-width:280px;margin:8px auto 16px">' +
            rings + axes +
            '<polygon points="' + dataPoly + '" fill="rgba(26,110,192,0.13)" stroke="#1a6ec0" stroke-width="2" stroke-linejoin="round"/>' +
            dots + labels + '</svg>';

        // Bar list
        var bars = skills.map(function (s) {
            var val   = app[s.key] || '—';
            var level = levelMap[app[s.key]] !== undefined ? levelMap[app[s.key]] : -1;
            var pct   = level >= 0 ? (level / 4 * 100).toFixed(0) : 0;
            var fillColor = level <= 0 ? '#d0d8e8' : level === 1 ? '#f0a040' : level === 2 ? '#40a0f0' : level === 3 ? '#40c080' : '#1a6ec0';
            return '<div class="skl-row">' +
                '<span class="skl-name">' + esc(s.label) + '</span>' +
                '<div class="skl-track"><div class="skl-fill" style="width:' + pct + '%;background:' + fillColor + '"></div></div>' +
                '<span class="skl-level">' + esc(val) + '</span>' +
                '</div>';
        }).join('');

        return '<div class="dp-section"><h4>Competencies</h4>' + svg +
            '<div class="skl-list">' + bars + '</div></div>';
    }

    function sec(title, rows) {
        var html = '<div class="dp-section"><h4>' + esc(title) + '</h4>';
        rows.forEach(function (r) {
            if (!r) return;
            var v = r[1] == null ? '—' : r[1];
            var isLink = typeof v === 'string' && v.startsWith('<a ');
            html += '<div class="dp-row"><div class="dp-lbl">' + esc(r[0]) + '</div><div class="dp-val">' + (isLink ? v : esc(String(v) || '—')) + '</div></div>';
        });
        return html + '</div>';
    }

    function renderFiles(app) {
        var files = [
            ['CV',               app.cv_path],
            ['Cover Letter',     app.cover_letter_path],
            ['Design Portfolio', app.design_portfolio_path],
            ['Additional',       app.additional_samples_path]
        ];
        var html = '<div class="dp-section"><h4>Uploaded Files</h4>';
        var any = false;
        files.forEach(function (f) {
            if (!f[1]) return; any = true;
            var name = f[1].split('/').pop();
            var prev = API + '?action=preview&path='  + enc(f[1]);
            var dl   = API + '?action=download&path=' + enc(f[1]);
            html += '<div class="file-row">' +
                '<button class="file-btn" data-preview="' + esc(prev) + '" data-download="' + esc(dl) + '" data-filename="' + esc(name) + '">' +
                '<svg class="file-ico" viewBox="0 0 20 20" fill="none" width="14" height="14"><path d="M5 2h7l4 4v12H5V2z" stroke="currentColor" stroke-width="1.4"/><path d="M12 2v5h4" stroke="currentColor" stroke-width="1.4"/></svg>' +
                '<span><strong>' + esc(f[0]) + '</strong> — ' + esc(name) + '</span>' +
                '</button>' +
                '<a class="file-dl" href="' + esc(dl) + '" title="Download" target="_blank" rel="noopener">↓</a>' +
                '</div>';
        });
        if (!any) html += '<p style="color:var(--muted);font-size:.86rem">No files uploaded.</p>';
        return html + '</div>';
    }

    function renderNotes(app) {
        var html = '<div class="dp-section"><h4>Internal Notes</h4>';
        if (app.internal_notes) html += '<div class="notes-log" id="notesLog">' + esc(app.internal_notes) + '</div>';
        html += '<textarea class="input-field" id="newNote" rows="3" placeholder="Add a note…"></textarea>' +
            '<div style="margin-top:8px"><button class="btn btn-gold btn-sm" id="addNoteBtn">Save Note</button></div></div>' +
            '<div class="dp-footer-actions">' +
            '<button class="btn btn-outline btn-sm" style="color:var(--danger);border-color:var(--danger)" id="deleteAppBtn">Delete Application</button>' +
            '</div>';
        return html;
    }

    function loadEmailLog(appId) {
        var el = document.getElementById('emailLogList');
        if (!el) return;
        fetch(API + '?action=email_log&id=' + appId)
            .then(function (r) { return r.json(); })
            .then(function (d) {
                if (!el) return;
                if (!Array.isArray(d.logs) || !d.logs.length) {
                    el.innerHTML = '<p style="color:var(--muted);font-size:.85rem">No emails sent yet.</p>';
                    return;
                }
                var TMPL_LABELS = { next_stage: 'Next Stage', on_hold: 'On Hold', rejection: 'Rejection', custom: 'Custom' };
                el.innerHTML = d.logs.map(function (log) {
                    var label = TMPL_LABELS[log.template] || log.template;
                    var note  = log.personal_note ? '<div class="el-note">' + esc(log.personal_note) + '</div>' : '';
                    return '<div class="el-row">' +
                        '<div class="el-head">' +
                            '<span class="el-badge">' + esc(label) + '</span>' +
                            '<span class="el-subject">' + esc(log.subject || '—') + '</span>' +
                        '</div>' +
                        note +
                        '<div class="el-meta">' + esc(fmtDate(log.sent_at)) + ' · by ' + esc(log.sent_by || 'admin') + '</div>' +
                        '</div>';
                }).join('');
            })
            .catch(function () {
                if (el) el.innerHTML = '<p style="color:var(--danger);font-size:.85rem">Could not load email history.</p>';
            });
    }

    function closePreview() {
        document.getElementById('previewOverlay').classList.add('hidden');
        document.getElementById('previewBody').innerHTML = '';
    }

    // ── Accounts ──────────────────────────────────────────────────
    function loadAccounts() {
        fetch(API + '?action=accounts_list').then(function (r) { return r.json(); })
            .then(function (d) {
                if (!Array.isArray(d.accounts)) return;
                var tbody = document.getElementById('accountTableBody');
                if (!d.accounts.length) { tbody.innerHTML = '<tr><td colspan="5" class="tbl-empty">No accounts</td></tr>'; return; }
                tbody.innerHTML = d.accounts.map(function (a) {
                    return '<tr><td>' + esc(a.username) + '</td><td>' + esc(a.email || '—') + '</td><td>' + esc(a.role) + '</td>' +
                        '<td>' + (Number(a.active) === 1 ? '<span style="color:var(--ok)">Active</span>' : '<span style="color:var(--danger)">Disabled</span>') + '</td>' +
                        '<td style="font-size:.8rem;color:var(--muted)">' + fmtDate(a.created_at) + '</td></tr>';
                }).join('');
            });
    }

    function createAccount(e) {
        e.preventDefault();
        var fd = new FormData(e.target); fd.append('action', 'accounts_create');
        fetch(API, { method: 'POST', body: fd }).then(function (r) { return r.json(); })
            .then(function (d) {
                var msg = document.getElementById('createAccountMsg');
                if (d.success) { msg.textContent = 'Account created.'; msg.className = 'form-msg ok'; e.target.reset(); loadAccounts(); }
                else { msg.textContent = d.error || 'Failed.'; msg.className = 'form-msg err'; }
            });
    }

    function changePassword(e) {
        e.preventDefault();
        var fd = new FormData(e.target); fd.append('action', 'change_password');
        fetch(API, { method: 'POST', body: fd }).then(function (r) { return r.json(); })
            .then(function (d) {
                var msg = document.getElementById('changePasswordMsg');
                if (d.success) { msg.textContent = 'Password updated.'; msg.className = 'form-msg ok'; e.target.reset(); }
                else { msg.textContent = d.error || 'Failed.'; msg.className = 'form-msg err'; }
            });
    }

    // ── Helpers ───────────────────────────────────────────────────
    function toast(msg, type) {
        var area = document.getElementById('toastArea');
        var el = document.createElement('div');
        el.className = 'toast' + (type ? ' ' + type : '');
        el.textContent = msg;
        el.title = 'Click to dismiss';
        el.style.cursor = 'pointer';
        el.addEventListener('click', function () { el.remove(); });
        area.appendChild(el);
        // Errors stay longer (10s) so there's time to read the full message
        setTimeout(function () { if (el.parentNode) el.remove(); }, type === 'err' ? 10000 : 4000);
    }

    function toastWithAction(msg, actionLabel, onAction) {
        var area = document.getElementById('toastArea');
        var el = document.createElement('div');
        el.className = 'toast ok toast-action';
        var span = document.createElement('span');
        span.textContent = msg;
        var btn = document.createElement('button');
        btn.className = 'toast-btn';
        btn.textContent = actionLabel;
        btn.addEventListener('click', function () { el.remove(); onAction(); });
        el.appendChild(span);
        el.appendChild(btn);
        area.appendChild(el);
        setTimeout(function () { if (el.parentNode) el.remove(); }, 8000);
    }

    function ini(first, last) {
        return ((first || '').charAt(0) + (last || '').charAt(0)).toUpperCase();
    }

    function statusBadge(status) {
        var cls = 'badge badge-' + String(status || '').toLowerCase().replace(/\s+/g, '');
        return '<span class="' + cls + '">' + esc(status || '—') + '</span>';
    }

    function lnk(url) {
        if (!url) return '—';
        return '<a href="' + esc(url) + '" target="_blank" rel="noopener">' + esc(url) + '</a>';
    }

    function shortLink(url) {
        if (!url) return '<span style="color:var(--muted)">—</span>';
        var label = url.replace(/^https?:\/\/(www\.)?/, '').replace(/\/$/, '');
        if (label.length > 28) label = label.slice(0, 26) + '…';
        return '<a href="' + esc(url) + '" target="_blank" rel="noopener" style="font-size:.78rem;color:var(--teal)">' + esc(label) + '</a>';
    }

    function fmtDate(str) {
        if (!str) return '—';
        var d = new Date(str.replace(' ', 'T'));
        if (isNaN(d.getTime())) return str;
        return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
    }

    function esc(str) {
        var d = document.createElement('div');
        d.textContent = (str == null ? '' : String(str));
        return d.innerHTML;
    }

    function enc(str) { return encodeURIComponent(str || ''); }

})();

/**
 * CapitalSavvy - Frontend Developer Application Form
 * Multi-step form with validation, auto-save, conditional fields, and file uploads
 */
(function() {
    'use strict';

    const STORAGE_KEY = 'cs_fd_application_draft';
    const STEP_NAMES = ['', 'Personal Information', 'Education & Background', 'Technical Skills & Portfolio', 'Motivation & Culture Fit', 'Uploads & Attachments', 'Review & Submit'];
    let currentStep = 1;
    const totalSteps = 6;
    let autoSaveTimer = null;

    // === Initialization ===
    document.addEventListener('DOMContentLoaded', function() {
        initConditionalFields();
        initFileUploads();
        initCharCounters();
        initValidation();
        initNavigation();
        initStartDate();
        initURLFields();
        loadDraft();
        updateProgress();
    });

    // === Step Navigation ===
    function initNavigation() {
        // Next buttons
        document.querySelectorAll('.btn-next').forEach(function(btn) {
            btn.addEventListener('click', function() {
                var next = parseInt(this.dataset.next);
                if (validateStep(currentStep)) {
                    goToStep(next);
                }
            });
        });

        // Previous buttons
        document.querySelectorAll('.btn-prev').forEach(function(btn) {
            btn.addEventListener('click', function() {
                var prev = parseInt(this.dataset.prev);
                goToStep(prev);
            });
        });

        // Progress step clicks (only completed steps)
        document.querySelectorAll('.progress-step').forEach(function(step) {
            step.addEventListener('click', function() {
                if (this.classList.contains('completed') || this.classList.contains('active')) {
                    var target = parseInt(this.dataset.step);
                    if (target < currentStep) {
                        goToStep(target);
                    }
                }
            });
        });

        // Form submission
        document.getElementById('applicationForm').addEventListener('submit', function(e) {
            e.preventDefault();
            submitApplication();
        });
    }

    function goToStep(step) {
        if (step === 6) {
            buildReview();
            checkFigmaHelper();
        }
        // Hide current
        document.querySelector('.form-step.active').classList.remove('active');
        // Show target
        document.querySelector('.form-step[data-step="' + step + '"]').classList.add('active');
        currentStep = step;
        updateProgress();
        saveDraft();
        // Scroll to top of form
        window.scrollTo({ top: document.querySelector('.progress-wrapper').offsetTop - 10, behavior: 'smooth' });
    }

    function updateProgress() {
        document.querySelectorAll('.progress-step').forEach(function(el) {
            var s = parseInt(el.dataset.step);
            el.classList.remove('active', 'completed', 'clickable');
            if (s === currentStep) {
                el.classList.add('active');
            } else if (s < currentStep) {
                el.classList.add('completed', 'clickable');
                el.querySelector('.step-circle').innerHTML = '&#10003;';
            } else {
                el.querySelector('.step-circle').textContent = s;
            }
        });
        document.getElementById('progressInfo').innerHTML = 'Step ' + currentStep + ' of ' + totalSteps + ' &mdash; ' + STEP_NAMES[currentStep];
    }

    // === Validation ===
    function initValidation() {
        // Validate on blur
        document.querySelectorAll('.form-group[data-validate] input, .form-group[data-validate] select, .form-group[data-validate] textarea').forEach(function(el) {
            el.addEventListener('blur', function() {
                validateField(this.closest('.form-group'));
            });
            el.addEventListener('input', function() {
                // Remove error state on input
                var group = this.closest('.form-group');
                if (group.classList.contains('has-error')) {
                    group.classList.remove('has-error');
                }
            });
        });
    }

    function validateField(group) {
        var type = group.dataset.validate;
        var input = group.querySelector('input, select, textarea');
        if (!input) return true;
        var val = input.value.trim();
        var valid = true;

        switch (type) {
            case 'required':
                valid = val.length > 0;
                if (valid && group.dataset.min) {
                    valid = val.length >= parseInt(group.dataset.min);
                }
                break;
            case 'email':
                valid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(val);
                break;
            case 'phone':
                valid = /^[\+]?[\d\s\-\(\)]{7,20}$/.test(val);
                break;
            case 'url-required':
                valid = val.length > 0 && isValidURL(val);
                break;
            case 'url':
                valid = val.length === 0 || isValidURL(val);
                break;
            case 'file-required':
                var fileInput = group.querySelector('input[type="file"]');
                valid = fileInput && fileInput.files && fileInput.files.length > 0;
                break;
            case 'checkbox-required':
                var cb = group.querySelector('input[type="checkbox"]');
                valid = cb && cb.checked;
                break;
        }

        if (valid) {
            group.classList.remove('has-error');
        } else {
            group.classList.add('has-error');
        }
        return valid;
    }

    function isValidURL(str) {
        // Accept URLs with or without protocol
        var url = str;
        if (!/^https?:\/\//i.test(url)) {
            url = 'https://' + url;
        }
        try { new URL(url); return true; } catch(e) { return false; }
    }

    // Auto-prepend https:// on blur for URL fields
    function initURLFields() {
        document.querySelectorAll('input[type="url"]').forEach(function(input) {
            input.addEventListener('blur', function() {
                var v = this.value.trim();
                if (v && !/^https?:\/\//i.test(v)) {
                    this.value = 'https://' + v;
                }
            });
        });
    }

    function validateStep(step) {
        var stepEl = document.querySelector('.form-step[data-step="' + step + '"]');
        var groups = stepEl.querySelectorAll('.form-group[data-validate]');
        var allValid = true;
        var firstError = null;

        groups.forEach(function(group) {
            // Skip hidden conditional fields
            var cond = group.closest('.conditional-field');
            if (cond && !cond.classList.contains('visible')) return;

            if (!validateField(group)) {
                allValid = false;
                if (!firstError) firstError = group;
            }
        });

        // Also validate agreement checkboxes in step 6
        if (step === 6) {
            stepEl.querySelectorAll('.agreement-item[data-validate]').forEach(function(item) {
                var cb = item.querySelector('input[type="checkbox"]');
                if (!cb.checked) {
                    allValid = false;
                    item.classList.add('has-error');
                    if (!firstError) firstError = item;
                } else {
                    item.classList.remove('has-error');
                }
            });
        }

        if (firstError) {
            firstError.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
        return allValid;
    }

    // === Conditional Fields ===
    function initConditionalFields() {
        document.querySelectorAll('.conditional-field').forEach(function(field) {
            var conditions = parseConditions(field);
            conditions.forEach(function(cond) {
                var trigger = document.querySelector('[name="' + cond.name + '"]');
                if (trigger) {
                    trigger.addEventListener('change', function() {
                        checkConditional(field);
                    });
                }
            });
            // Initial check
            checkConditional(field);
        });
    }

    function parseConditions(field) {
        var conditions = [];
        var main = field.dataset.showWhen;
        if (main) {
            var parts = main.split('=');
            conditions.push({ name: parts[0], value: parts[1] });
        }
        var also = field.dataset.alsoWhen;
        if (also) {
            var parts2 = also.split('=');
            conditions.push({ name: parts2[0], value: parts2[1] });
        }
        return conditions;
    }

    function checkConditional(field) {
        var conditions = parseConditions(field);
        var show = false;
        conditions.forEach(function(cond) {
            var trigger = document.querySelector('[name="' + cond.name + '"]');
            if (trigger && trigger.value === cond.value) {
                show = true;
            }
        });
        if (show) {
            field.classList.add('visible');
        } else {
            field.classList.remove('visible');
            // Clear hidden field values
            field.querySelectorAll('input, select, textarea').forEach(function(inp) {
                inp.value = '';
            });
        }
    }

    // === File Uploads ===
    function initFileUploads() {
        document.querySelectorAll('.upload-zone').forEach(function(zone) {
            var fileInput = zone.querySelector('input[type="file"]');
            var fileInfo = zone.querySelector('.file-info');
            var fileName = zone.querySelector('.file-name');
            var removeBtn = zone.querySelector('.remove-file');
            var maxSize = parseInt(zone.dataset.maxSize) || 5; // MB

            // Drag events
            zone.addEventListener('dragover', function(e) {
                e.preventDefault();
                zone.classList.add('dragover');
            });
            zone.addEventListener('dragleave', function() {
                zone.classList.remove('dragover');
            });
            zone.addEventListener('drop', function(e) {
                e.preventDefault();
                zone.classList.remove('dragover');
                if (e.dataTransfer.files.length > 0) {
                    handleFile(fileInput, e.dataTransfer.files[0], maxSize, fileName, fileInfo, zone);
                }
            });

            // File input change
            fileInput.addEventListener('change', function() {
                if (this.files.length > 0) {
                    handleFile(fileInput, this.files[0], maxSize, fileName, fileInfo, zone);
                }
            });

            // Remove file
            removeBtn.addEventListener('click', function(e) {
                e.stopPropagation();
                fileInput.value = '';
                fileInfo.classList.remove('has-file');
                zone.closest('.form-group').classList.remove('has-error');
            });
        });
    }

    function handleFile(input, file, maxSize, nameEl, infoEl, zone) {
        var sizeMB = file.size / (1024 * 1024);
        if (sizeMB > maxSize) {
            alert('File is too large. Maximum size is ' + maxSize + 'MB. Your file is ' + sizeMB.toFixed(1) + 'MB.');
            input.value = '';
            return;
        }
        // Check accepted extensions
        var accept = zone.dataset.accept;
        if (accept) {
            var ext = '.' + file.name.split('.').pop().toLowerCase();
            var accepted = accept.split(',').map(function(a) { return a.trim().toLowerCase(); });
            if (accepted.indexOf(ext) === -1) {
                alert('File type not accepted. Please upload: ' + accept);
                input.value = '';
                return;
            }
        }
        // Assign file via DataTransfer if from drag
        if (input.files.length === 0 || input.files[0] !== file) {
            var dt = new DataTransfer();
            dt.items.add(file);
            input.files = dt.files;
        }
        nameEl.textContent = file.name + ' (' + sizeMB.toFixed(1) + ' MB)';
        infoEl.classList.add('has-file');
        zone.closest('.form-group').classList.remove('has-error');
    }

    // === Character Counters ===
    function initCharCounters() {
        document.querySelectorAll('.char-counter').forEach(function(counter) {
            var textarea = counter.previousElementSibling;
            if (!textarea || textarea.tagName !== 'TEXTAREA') {
                textarea = counter.parentElement.querySelector('textarea');
            }
            if (textarea) {
                textarea.addEventListener('input', function() {
                    var count = this.value.length;
                    var max = parseInt(this.getAttribute('maxlength')) || 0;
                    counter.querySelector('.count').textContent = count;
                    if (count > max * 0.9) {
                        counter.classList.add('warning');
                    } else {
                        counter.classList.remove('warning');
                    }
                });
            }
        });
    }

    // === Start Date Min ===
    function initStartDate() {
        var dateInput = document.querySelector('input[name="start_date"]');
        if (dateInput) {
            var min = new Date();
            min.setDate(min.getDate() + 14); // 2 weeks from today
            dateInput.min = min.toISOString().split('T')[0];
        }
    }

    // === Figma Helper ===
    function checkFigmaHelper() {
        var figmaUrl = document.querySelector('input[name="figma_url"]');
        var helper = document.querySelector('.figma-helper');
        if (figmaUrl && helper) {
            helper.style.display = figmaUrl.value.trim() ? 'block' : 'none';
        }
    }

    // === Auto-Save to localStorage ===
    function saveDraft() {
        clearTimeout(autoSaveTimer);
        autoSaveTimer = setTimeout(function() {
            var form = document.getElementById('applicationForm');
            var data = {};
            // Save text/select fields
            form.querySelectorAll('input[type="text"], input[type="email"], input[type="tel"], input[type="url"], input[type="date"], input[type="month"], select, textarea').forEach(function(el) {
                if (el.name) data[el.name] = el.value;
            });
            // Save radio buttons
            form.querySelectorAll('input[type="radio"]:checked').forEach(function(el) {
                data[el.name] = el.value;
            });
            // Save checkboxes
            form.querySelectorAll('input[type="checkbox"]').forEach(function(el) {
                data[el.name] = el.checked;
            });
            data._step = currentStep;
            data._savedAt = new Date().toISOString();

            try {
                localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
                showAutoSave();
            } catch(e) { /* localStorage full or unavailable */ }
        }, 500);
    }

    function loadDraft() {
        try {
            var raw = localStorage.getItem(STORAGE_KEY);
            if (!raw) return;
            var data = JSON.parse(raw);
            var form = document.getElementById('applicationForm');

            Object.keys(data).forEach(function(key) {
                if (key.startsWith('_')) return;
                var el = form.querySelector('[name="' + key + '"]');
                if (!el) return;

                if (el.type === 'checkbox') {
                    el.checked = !!data[key];
                } else if (el.type === 'radio') {
                    var radio = form.querySelector('input[name="' + key + '"][value="' + data[key] + '"]');
                    if (radio) radio.checked = true;
                } else {
                    el.value = data[key];
                    // Trigger change for selects (conditional fields)
                    if (el.tagName === 'SELECT') {
                        el.dispatchEvent(new Event('change'));
                    }
                }
            });

            // Update char counters
            form.querySelectorAll('textarea').forEach(function(ta) {
                ta.dispatchEvent(new Event('input'));
            });
        } catch(e) { /* corrupt data, ignore */ }
    }

    function showAutoSave() {
        var indicator = document.getElementById('autosaveIndicator');
        indicator.classList.add('visible');
        setTimeout(function() { indicator.classList.remove('visible'); }, 2000);
    }

    // Auto-save on field changes
    document.addEventListener('change', function(e) {
        if (e.target.closest('#applicationForm')) saveDraft();
    });
    document.addEventListener('input', function(e) {
        if (e.target.closest('#applicationForm') && (e.target.tagName === 'TEXTAREA' || e.target.tagName === 'INPUT')) {
            saveDraft();
        }
    });

    // === Build Review ===
    function buildReview() {
        var form = document.getElementById('applicationForm');
        var html = '';

        // Step 1
        html += reviewSection('Personal Information', 1, [
            ['First Name', val('first_name')],
            ['Last Name', val('last_name')],
            ['Email', val('email')],
            ['Phone', val('phone')],
            ['Country', val('country')],
            ['City', val('city')],
            ['Gender', val('gender') || 'Not specified'],
            ['Heard About Role', val('heard_about')],
            val('referral_name') ? ['Referred By', val('referral_name')] : null,
            val('heard_other') ? ['Other Source', val('heard_other')] : null
        ]);

        // Step 2
        html += reviewSection('Education & Background', 2, [
            ['Education Level', val('education_level')],
            ['Institution', val('institution')],
            ['Field of Study', val('field_of_study')],
            val('field_other') ? ['Other Field', val('field_other')] : null,
            ['Graduation Year', val('graduation_year')],
            val('expected_graduation') ? ['Expected Graduation', val('expected_graduation')] : null,
            ['Experience', val('years_experience')],
            ['Employment Status', val('employment_status')],
            val('current_role') ? ['Current Role', val('current_role')] : null
        ]);

        // Step 3
        var skills = ['skill_figma', 'skill_react', 'skill_javascript', 'skill_html_css', 'skill_typescript', 'skill_nextjs', 'skill_tailwind', 'skill_git', 'skill_rest_api', 'skill_state_mgmt'];
        var skillNames = ['Figma', 'React.js', 'JavaScript', 'HTML & CSS', 'TypeScript', 'Next.js', 'Tailwind', 'Git/GitHub', 'REST APIs', 'State Mgmt'];
        var skillRows = skills.map(function(s, i) {
            var checked = form.querySelector('input[name="' + s + '"]:checked');
            return [skillNames[i], checked ? checked.value : 'Not rated'];
        });
        html += reviewSection('Technical Skills & Portfolio', 3, skillRows.concat([
            ['GitHub', val('github_url') || 'Not provided'],
            ['Figma', val('figma_url') || 'Not provided'],
            ['Portfolio', val('portfolio_url') || 'Not provided'],
            ['LinkedIn', val('linkedin_url') || 'Not provided'],
            ['Best Project URL', val('best_project_url') || 'Not provided'],
            ['Best Project', val('best_project_desc')]
        ]));

        // Step 4
        html += reviewSection('Motivation & Culture Fit', 4, [
            ['Why CapitalSavvy', truncate(val('why_capitalsavvy'), 200)],
            ['Learning Approach', truncate(val('learn_new_tech'), 200)],
            ['Good Design', truncate(val('good_design'), 200) || 'Not provided'],
            ['Handling Feedback', truncate(val('handle_feedback'), 200)],
            ['Future of Fintech', truncate(val('future_fintech'), 200) || 'Not provided'],
            ['Hybrid Preference', val('hybrid_preference')],
            ['Start Date', val('start_date')],
            ['Salary Range', val('salary_range')]
        ]);

        // Step 5
        var files = [];
        ['cv_file', 'cover_letter_file', 'design_portfolio_file', 'additional_samples_file'].forEach(function(name) {
            var input = form.querySelector('input[name="' + name + '"]');
            var label = name.replace(/_file$/, '').replace(/_/g, ' ');
            label = label.charAt(0).toUpperCase() + label.slice(1);
            files.push([label, input && input.files.length > 0 ? input.files[0].name : 'Not uploaded']);
        });
        html += reviewSection('Uploads', 5, files);

        document.getElementById('reviewContent').innerHTML = html;

        // Wire edit links
        document.querySelectorAll('.edit-link').forEach(function(link) {
            link.addEventListener('click', function(e) {
                e.preventDefault();
                goToStep(parseInt(this.dataset.editStep));
            });
        });
    }

    function val(name) {
        var el = document.querySelector('[name="' + name + '"]');
        return el ? el.value.trim() : '';
    }

    function truncate(str, max) {
        if (!str || str.length <= max) return str;
        return str.substring(0, max) + '...';
    }

    function reviewSection(title, step, rows) {
        var html = '<div class="review-section">';
        html += '<div class="review-section-header"><h3>' + title + '</h3><a href="#" class="edit-link" data-edit-step="' + step + '">Edit</a></div>';
        rows.forEach(function(row) {
            if (!row) return;
            html += '<div class="review-row"><div class="review-label">' + row[0] + '</div><div class="review-value">' + escapeHtml(row[1] || '') + '</div></div>';
        });
        html += '</div>';
        return html;
    }

    function escapeHtml(str) {
        var div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    }

    // === Form Submission ===
    function submitApplication() {
        if (!validateStep(6)) return;

        var btn = document.getElementById('submitBtn');
        var errDiv = document.getElementById('submitError');
        btn.classList.add('loading');
        btn.disabled = true;
        errDiv.style.display = 'none';

        var form = document.getElementById('applicationForm');
        var formData = new FormData(form);

        // Add checked radio values explicitly (FormData may miss unchecked)
        form.querySelectorAll('input[type="radio"]:checked').forEach(function(r) {
            formData.set(r.name, r.value);
        });

        // Add checkbox values
        form.querySelectorAll('input[type="checkbox"]').forEach(function(cb) {
            formData.set(cb.name, cb.checked ? '1' : '0');
        });

        fetch('../api/submit.php', {
            method: 'POST',
            body: formData
        })
        .then(function(res) { return res.json(); })
        .then(function(data) {
            btn.classList.remove('loading');
            btn.disabled = false;
            if (data.success) {
                // Clear draft
                localStorage.removeItem(STORAGE_KEY);
                // Show confirmation
                document.getElementById('refNumber').textContent = data.reference;
                document.getElementById('confirmEmail').textContent = val('email');
                document.querySelector('.form-step.active').classList.remove('active');
                document.getElementById('confirmationScreen').classList.add('active');
                document.querySelector('.progress-wrapper').style.display = 'none';
                document.getElementById('autosaveIndicator').style.display = 'none';
                window.scrollTo({ top: 0, behavior: 'smooth' });
            } else {
                errDiv.textContent = data.error || 'Something went wrong. Please try again.';
                errDiv.style.display = 'block';
            }
        })
        .catch(function(err) {
            btn.classList.remove('loading');
            btn.disabled = false;
            errDiv.textContent = 'Network error. Please check your connection and try again.';
            errDiv.style.display = 'block';
        });
    }

})();

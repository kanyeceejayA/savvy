<?php
/**
 * CapitalSavvy - Application Form Submission Handler
 * Receives multipart form data, validates, stores files, saves to SQLite, sends emails.
 */
require_once __DIR__ . '/config.php';
require_once __DIR__ . '/resend.php';

header('Content-Type: application/json');

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    jsonResponse(['error' => 'Method not allowed'], 405);
}

try {
    $db = getDB();

    // --- Collect & Sanitize Fields ---
    $fields = [
        'first_name', 'last_name', 'email', 'phone', 'country', 'city', 'gender',
        'heard_about', 'referral_name', 'heard_other',
        'education_level', 'institution', 'field_of_study', 'field_other',
        'graduation_year', 'expected_graduation', 'years_experience', 'employment_status', 'current_role',
        'skill_figma', 'skill_react', 'skill_javascript', 'skill_html_css', 'skill_typescript',
        'skill_nextjs', 'skill_tailwind', 'skill_git', 'skill_rest_api', 'skill_state_mgmt',
        'github_url', 'figma_url', 'portfolio_url', 'linkedin_url', 'best_project_url', 'best_project_desc',
        'why_capitalsavvy', 'learn_new_tech', 'good_design', 'handle_feedback', 'future_fintech',
        'hybrid_preference', 'start_date', 'salary_range'
    ];

    $data = [];
    foreach ($fields as $f) {
        $data[$f] = isset($_POST[$f]) ? sanitize($_POST[$f]) : '';
    }

    // Checkboxes
    $data['privacy_consent'] = !empty($_POST['privacy_consent']) ? 1 : 0;
    $data['accuracy_declaration'] = !empty($_POST['accuracy_declaration']) ? 1 : 0;
    $data['communication_consent'] = !empty($_POST['communication_consent']) ? 1 : 0;
    $data['assessment_consent'] = !empty($_POST['assessment_consent']) ? 1 : 0;

    // --- Server-Side Validation ---
    $required = [
        'first_name', 'last_name', 'email', 'phone', 'country', 'city',
        'heard_about', 'education_level', 'institution', 'field_of_study',
        'graduation_year', 'years_experience', 'employment_status',
        'github_url', 'best_project_desc',
        'why_capitalsavvy', 'learn_new_tech', 'handle_feedback',
        'hybrid_preference', 'start_date', 'salary_range'
    ];

    foreach ($required as $r) {
        if (empty($data[$r])) {
            jsonResponse(['error' => 'Missing required field: ' . str_replace('_', ' ', $r)], 400);
        }
    }

    if (!filter_var($data['email'], FILTER_VALIDATE_EMAIL)) {
        jsonResponse(['error' => 'Invalid email address'], 400);
    }

    if (!$data['privacy_consent'] || !$data['accuracy_declaration'] || !$data['communication_consent']) {
        jsonResponse(['error' => 'You must agree to all required declarations'], 400);
    }

    // --- Duplicate application check (one active application per email per role) ---
    $position = 'Frontend Developer';
    $dupStmt = $db->prepare("SELECT id FROM applications WHERE email = ? AND COALESCE(position,'Frontend Developer') = ? AND status NOT IN ('Rejected','Archived')");
    $dupStmt->bindValue(1, $data['email'], SQLITE3_TEXT);
    $dupStmt->bindValue(2, $position, SQLITE3_TEXT);
    if ($dupStmt->execute()->fetchArray(SQLITE3_ASSOC)) {
        jsonResponse(['error' => 'You already have an active application for this role. Please check your email for your reference number.'], 409);
    }

    // --- Generate Reference ---
    $reference = generateReference();

    // --- Handle File Uploads ---
    global $UPLOAD_DIR;
    $uploadPath = $UPLOAD_DIR . $reference . '/';
    if (!is_dir($uploadPath)) {
        mkdir($uploadPath, 0755, true);
    }

    $fileFields = [
        'cv_file' => ['required' => true, 'max' => 5, 'column' => 'cv_path'],
        'cover_letter_file' => ['required' => true, 'max' => 5, 'column' => 'cover_letter_path'],
        'design_portfolio_file' => ['required' => false, 'max' => 10, 'column' => 'design_portfolio_path'],
        'additional_samples_file' => ['required' => false, 'max' => 15, 'column' => 'additional_samples_path'],
    ];

    foreach ($fileFields as $fieldName => $config) {
        if (!isset($_FILES[$fieldName]) || $_FILES[$fieldName]['error'] === UPLOAD_ERR_NO_FILE) {
            if ($config['required']) {
                jsonResponse(['error' => str_replace('_file', '', $fieldName) . ' is required'], 400);
            }
            $data[$config['column']] = '';
            continue;
        }

        $file = $_FILES[$fieldName];
        if ($file['error'] !== UPLOAD_ERR_OK) {
            jsonResponse(['error' => 'File upload error for ' . $fieldName . ': code ' . $file['error']], 400);
        }

        // Size check
        $maxBytes = $config['max'] * 1024 * 1024;
        if ($file['size'] > $maxBytes) {
            jsonResponse(['error' => $fieldName . ' exceeds max size of ' . $config['max'] . 'MB'], 400);
        }

        // Extension check
        $ext = strtolower(pathinfo($file['name'], PATHINFO_EXTENSION));
        $allowed = ['pdf', 'docx', 'png', 'jpg', 'jpeg', 'zip'];
        if (!in_array($ext, $allowed)) {
            jsonResponse(['error' => 'Invalid file type: ' . $ext], 400);
        }

        // MIME type validation - verify actual file content matches extension
        $finfo = new finfo(FILEINFO_MIME_TYPE);
        $detectedMime = $finfo->file($file['tmp_name']);
        $mimeWhitelist = [
            'pdf'  => ['application/pdf'],
            'docx' => ['application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'application/zip'],
            'png'  => ['image/png'],
            'jpg'  => ['image/jpeg'],
            'jpeg' => ['image/jpeg'],
            'zip'  => ['application/zip', 'application/x-zip-compressed'],
        ];
        if (!isset($mimeWhitelist[$ext]) || !in_array($detectedMime, $mimeWhitelist[$ext])) {
            jsonResponse(['error' => 'File content does not match extension (' . $ext . '). Detected: ' . $detectedMime], 400);
        }

        // Reject files with double extensions or PHP content
        $lowerName = strtolower($file['name']);
        if (preg_match('/\.php|\.phtml|\.phar|\.htaccess|\.sh|\.exe|\.bat|\.cmd/i', $lowerName)) {
            jsonResponse(['error' => 'File type not allowed'], 400);
        }

        // Save file with sanitized name
        $safeName = preg_replace('/[^a-zA-Z0-9_\-\.]/', '_', $file['name']);
        // Ensure the extension is still one of the allowed ones after sanitization
        $safeExt = strtolower(pathinfo($safeName, PATHINFO_EXTENSION));
        if (!in_array($safeExt, $allowed)) {
            $safeName .= '.' . $ext;
        }
        $destPath = $uploadPath . $safeName;
        if (!move_uploaded_file($file['tmp_name'], $destPath)) {
            jsonResponse(['error' => 'Failed to save file: ' . $fieldName], 500);
        }

        $data[$config['column']] = $reference . '/' . $safeName;
    }

    // --- Insert into Database ---
    $columns = array_merge($fields, ['privacy_consent', 'accuracy_declaration', 'communication_consent', 'assessment_consent', 'cv_path', 'cover_letter_path', 'design_portfolio_path', 'additional_samples_path', 'position', 'reference_number']);
    $data['position'] = $position;
    $data['reference_number'] = $reference;

    $placeholders = implode(', ', array_fill(0, count($columns), '?'));
    $colStr = implode(', ', $columns);
    $stmt = $db->prepare("INSERT INTO applications ($colStr) VALUES ($placeholders)");

    $i = 1;
    foreach ($columns as $col) {
        $stmt->bindValue($i++, $data[$col]);
    }

    if (!$stmt->execute()) {
        jsonResponse(['error' => 'Database error. Please try again.'], 500);
    }

    // --- Send Emails ---
    $applicantName = $data['first_name'] . ' ' . $data['last_name'];

    // Confirmation + application summary to applicant
    sendConfirmationEmail($data['email'], $data, $reference);

    // Notification to admin
    sendAdminNotification($applicantName, $data['email'], $reference);

    // Mark draft as completed if token was provided
    $draftToken = trim($_POST['draft_token'] ?? '');
    if ($draftToken !== '') {
        $clear = $db->prepare("UPDATE application_drafts SET completed_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE draft_token = ?");
        $clear->bindValue(1, $draftToken, SQLITE3_TEXT);
        $clear->execute();
    }

    // --- Success ---
    jsonResponse([
        'success' => true,
        'reference' => $reference,
        'message' => 'Application submitted successfully'
    ]);

} catch (Exception $e) {
    jsonResponse(['error' => 'Server error: ' . $e->getMessage()], 500);
}

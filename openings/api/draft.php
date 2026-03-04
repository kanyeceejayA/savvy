<?php
/**
 * Draft save/load API for application form.
 */
require_once __DIR__ . '/config.php';

header('Content-Type: application/json');

$action = $_GET['action'] ?? $_POST['action'] ?? 'save';
$db = getDB();

if ($action === 'save') {
    saveDraft($db);
} elseif ($action === 'load') {
    loadDraft($db);
} elseif ($action === 'clear') {
    clearDraft($db);
} else {
    jsonResponse(['error' => 'Unknown action'], 400);
}

function saveDraft($db) {
    $token = trim($_POST['draft_token'] ?? '');
    $step = max(1, min(6, intval($_POST['current_step'] ?? 1)));
    $draftRaw = $_POST['draft_json'] ?? '';
    $email = trim($_POST['email'] ?? '');
    $referenceHint = trim($_POST['reference_hint'] ?? '');

    if ($draftRaw === '') {
        jsonResponse(['error' => 'Missing draft payload'], 400);
    }
    json_decode($draftRaw, true);
    if (json_last_error() !== JSON_ERROR_NONE) {
        jsonResponse(['error' => 'Invalid draft payload'], 400);
    }

    if ($token === '') {
        $token = bin2hex(random_bytes(24));
        $stmt = $db->prepare("INSERT INTO application_drafts (draft_token, email, reference_hint, current_step, draft_json, created_at, updated_at) VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)");
        $stmt->bindValue(1, $token, SQLITE3_TEXT);
        $stmt->bindValue(2, $email, SQLITE3_TEXT);
        $stmt->bindValue(3, $referenceHint, SQLITE3_TEXT);
        $stmt->bindValue(4, $step, SQLITE3_INTEGER);
        $stmt->bindValue(5, $draftRaw, SQLITE3_TEXT);
        $stmt->execute();
    } else {
        $stmt = $db->prepare("UPDATE application_drafts SET email = ?, reference_hint = ?, current_step = ?, draft_json = ?, updated_at = CURRENT_TIMESTAMP WHERE draft_token = ? AND completed_at IS NULL");
        $stmt->bindValue(1, $email, SQLITE3_TEXT);
        $stmt->bindValue(2, $referenceHint, SQLITE3_TEXT);
        $stmt->bindValue(3, $step, SQLITE3_INTEGER);
        $stmt->bindValue(4, $draftRaw, SQLITE3_TEXT);
        $stmt->bindValue(5, $token, SQLITE3_TEXT);
        $stmt->execute();

        if ($db->changes() === 0) {
            $insert = $db->prepare("INSERT INTO application_drafts (draft_token, email, reference_hint, current_step, draft_json, created_at, updated_at) VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)");
            $insert->bindValue(1, $token, SQLITE3_TEXT);
            $insert->bindValue(2, $email, SQLITE3_TEXT);
            $insert->bindValue(3, $referenceHint, SQLITE3_TEXT);
            $insert->bindValue(4, $step, SQLITE3_INTEGER);
            $insert->bindValue(5, $draftRaw, SQLITE3_TEXT);
            $insert->execute();
        }
    }

    $resumeUrl = $GLOBALS['SITE_URL'] . '/openings/frontend-developer/?draft=' . urlencode($token);
    jsonResponse([
        'success' => true,
        'draft_token' => $token,
        'resume_url' => $resumeUrl,
        'saved_at' => date('c')
    ]);
}

function loadDraft($db) {
    $token = trim($_GET['draft_token'] ?? '');
    if ($token === '') {
        jsonResponse(['error' => 'Missing draft token'], 400);
    }

    $stmt = $db->prepare("SELECT draft_token, email, reference_hint, current_step, draft_json, updated_at FROM application_drafts WHERE draft_token = ? AND completed_at IS NULL LIMIT 1");
    $stmt->bindValue(1, $token, SQLITE3_TEXT);
    $row = $stmt->execute()->fetchArray(SQLITE3_ASSOC);
    if (!$row) {
        jsonResponse(['error' => 'Draft not found'], 404);
    }

    jsonResponse(['success' => true, 'draft' => $row]);
}

function clearDraft($db) {
    $token = trim($_POST['draft_token'] ?? '');
    if ($token === '') {
        jsonResponse(['success' => true]);
    }

    $stmt = $db->prepare("UPDATE application_drafts SET completed_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE draft_token = ?");
    $stmt->bindValue(1, $token, SQLITE3_TEXT);
    $stmt->execute();
    jsonResponse(['success' => true]);
}

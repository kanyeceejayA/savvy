<?php
/**
 * CapitalSavvy - Resend Email Helper
 * Sends emails via the Resend API (https://resend.com/docs/api-reference/emails/send-email)
 */

function sendViaResend($to, $subject, $htmlBody) {
    global $RESEND_API_KEY, $FROM_EMAIL;

    if ($RESEND_API_KEY === 'YOUR_RESEND_API_KEY_HERE') {
        // API key not configured — log but don't fail
        error_log('[CapitalSavvy] Resend API key not configured. Email to ' . $to . ' not sent.');
        return false;
    }

    $payload = json_encode([
        'from' => $FROM_EMAIL,
        'to' => [$to],
        'subject' => $subject,
        'html' => $htmlBody
    ]);

    $ch = curl_init('https://api.resend.com/emails');
    curl_setopt_array($ch, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_POST => true,
        CURLOPT_POSTFIELDS => $payload,
        CURLOPT_HTTPHEADER => [
            'Authorization: Bearer ' . $RESEND_API_KEY,
            'Content-Type: application/json'
        ],
        CURLOPT_TIMEOUT => 10
    ]);

    $response = curl_exec($ch);
    $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);

    if ($httpCode >= 200 && $httpCode < 300) {
        return true;
    }

    error_log('[CapitalSavvy] Resend API error (' . $httpCode . '): ' . $response);
    return false;
}

function sendConfirmationEmail($email, $name, $reference) {
    $subject = 'Application Received - CapitalSavvy Frontend Developer';
    $html = '
    <!DOCTYPE html>
    <html>
    <head><meta charset="UTF-8"></head>
    <body style="font-family:Roboto,Arial,sans-serif;color:#2c2c2c;max-width:600px;margin:0 auto;padding:20px;">
        <div style="text-align:center;padding:24px 0;border-bottom:2px solid #B9915B;">
            <h1 style="color:#333646;font-weight:400;font-size:22px;margin:0;">CapitalSavvy</h1>
            <p style="color:#888;font-size:13px;margin:4px 0 0;">Building the Future of Finance in Uganda</p>
        </div>

        <div style="padding:28px 0;">
            <p style="font-size:16px;">Dear ' . htmlspecialchars($name) . ',</p>
            <p>Thank you for applying for the <strong>Frontend Developer</strong> position at CapitalSavvy. We have successfully received your application.</p>

            <div style="background:#f9f3ea;border-left:4px solid #B9915B;padding:16px 20px;margin:20px 0;border-radius:4px;">
                <p style="margin:0;font-size:14px;color:#888;">Your Reference Number</p>
                <p style="margin:4px 0 0;font-size:20px;font-weight:500;color:#B9915B;letter-spacing:1px;">' . htmlspecialchars($reference) . '</p>
            </div>

            <p>Please save this reference number for future correspondence.</p>

            <h3 style="color:#333646;font-size:16px;margin-top:24px;">What Happens Next?</h3>
            <p>We aim to respond within <strong>5 business days</strong>. Our selection process has three stages:</p>
            <ol style="color:#555;line-height:1.8;">
                <li><strong>Application Review</strong> — We review your application, portfolio, and CV.</li>
                <li><strong>Technical Assessment</strong> — A take-home challenge combining Figma design and React/Next.js development.</li>
                <li><strong>Culture &amp; Values Conversation</strong> — A conversation with the team to assess mutual fit.</li>
            </ol>

            <p>If you have any questions, don\'t hesitate to reach out at <a href="mailto:info@capitalsavvy.pro" style="color:#B9915B;">info@capitalsavvy.pro</a>.</p>

            <p style="margin-top:24px;">Best regards,<br><strong>The CapitalSavvy Team</strong></p>
        </div>

        <div style="border-top:1px solid #e0e0e0;padding-top:16px;font-size:12px;color:#999;text-align:center;">
            <p>CapitalSavvy Ltd &middot; Suite 2C Ecobank Plaza, Plot 4, Parliament Avenue &middot; Kampala, Uganda</p>
            <p>&copy; 2026 CapitalSavvy Ltd. All Rights Reserved.</p>
        </div>
    </body>
    </html>';

    return sendViaResend($email, $subject, $html);
}

function sendAdminNotification($applicantName, $applicantEmail, $reference) {
    global $ADMIN_EMAIL, $SITE_URL;

    $subject = 'New Application: ' . $applicantName . ' [' . $reference . ']';
    $html = '
    <!DOCTYPE html>
    <html>
    <head><meta charset="UTF-8"></head>
    <body style="font-family:Roboto,Arial,sans-serif;color:#2c2c2c;max-width:600px;margin:0 auto;padding:20px;">
        <h2 style="color:#333646;">New Frontend Developer Application</h2>
        <p><strong>Applicant:</strong> ' . htmlspecialchars($applicantName) . '</p>
        <p><strong>Email:</strong> ' . htmlspecialchars($applicantEmail) . '</p>
        <p><strong>Reference:</strong> ' . htmlspecialchars($reference) . '</p>
        <p style="margin-top:20px;">
            <a href="' . $SITE_URL . '/openings/admin/" style="display:inline-block;background:#B9915B;color:#fff;padding:10px 24px;text-decoration:none;">View in Dashboard</a>
        </p>
    </body>
    </html>';

    return sendViaResend($ADMIN_EMAIL, $subject, $html);
}

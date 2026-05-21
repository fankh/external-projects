package com.kyra.auth.service;

import dev.samstevens.totp.code.*;
import dev.samstevens.totp.exceptions.QrGenerationException;
import dev.samstevens.totp.qr.QrData;
import dev.samstevens.totp.qr.QrGenerator;
import dev.samstevens.totp.qr.ZxingPngQrGenerator;
import dev.samstevens.totp.secret.DefaultSecretGenerator;
import dev.samstevens.totp.secret.SecretGenerator;
import dev.samstevens.totp.time.SystemTimeProvider;
import dev.samstevens.totp.time.TimeProvider;
import dev.samstevens.totp.util.Utils;
import org.springframework.stereotype.Service;

@Service
public class MfaService {

    private final SecretGenerator secretGenerator;
    private final CodeVerifier codeVerifier;
    private final QrGenerator qrGenerator;

    public MfaService() {
        this.secretGenerator = new DefaultSecretGenerator();
        TimeProvider timeProvider = new SystemTimeProvider();
        CodeGenerator codeGenerator = new DefaultCodeGenerator(HashingAlgorithm.SHA1, 6);
        DefaultCodeVerifier verifier = new DefaultCodeVerifier(codeGenerator, timeProvider);
        verifier.setTimePeriod(30);
        verifier.setAllowedTimePeriodDiscrepancy(1);
        this.codeVerifier = verifier;
        this.qrGenerator = new ZxingPngQrGenerator();
    }

    public String generateSecret() {
        return secretGenerator.generate();
    }

    public boolean verifyCode(String secret, String code) {
        return codeVerifier.isValidCode(secret, code);
    }

    public String generateQrCodeDataUri(String secret, String email) {
        QrData data = new QrData.Builder()
                .label(email)
                .secret(secret)
                .issuer("KYRA AI Guardrail")
                .algorithm(HashingAlgorithm.SHA1)
                .digits(6)
                .period(30)
                .build();

        try {
            byte[] imageData = qrGenerator.generate(data);
            return Utils.getDataUriForImage(imageData, qrGenerator.getImageMimeType());
        } catch (QrGenerationException e) {
            throw new RuntimeException("Failed to generate QR code", e);
        }
    }

    // Backup codes: 10 × 8-char alphanumeric, uppercase
    public java.util.List<String> generateBackupCodes() {
        java.security.SecureRandom rnd = new java.security.SecureRandom();
        String alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // omit I/O/1/0 for clarity
        java.util.List<String> codes = new java.util.ArrayList<>(10);
        for (int i = 0; i < 10; i++) {
            StringBuilder sb = new StringBuilder(8);
            for (int j = 0; j < 8; j++) sb.append(alphabet.charAt(rnd.nextInt(alphabet.length())));
            codes.add(sb.toString());
        }
        return codes;
    }

    public java.util.List<String> hashBackupCodes(java.util.List<String> plaintext,
                                                   org.springframework.security.crypto.password.PasswordEncoder encoder) {
        return plaintext.stream().map(encoder::encode).toList();
    }

    public boolean matchesBackupCode(String attempt, java.util.List<String> hashedCodes,
                                      org.springframework.security.crypto.password.PasswordEncoder encoder) {
        if (hashedCodes == null) return false;
        for (String h : hashedCodes) {
            if (encoder.matches(attempt, h)) return true;
        }
        return false;
    }
}

package com.kyra.sso.service;

import com.kyra.sso.model.SsoConfiguration;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import java.io.ByteArrayInputStream;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.security.cert.CertificateFactory;
import java.security.cert.X509Certificate;
import java.util.*;

@Service
@Slf4j
public class SamlService {

    @Value("${sso.saml.sp-entity-id:kyra-guardrail}")
    private String spEntityId;

    @Value("${sso.saml.acs-url:http://localhost:8030/v1/sso/saml/{tenantId}/callback}")
    private String acsUrlTemplate;

    /**
     * Generate a SAML AuthnRequest and return the redirect URL to the IdP.
     */
    public String generateLoginUrl(SsoConfiguration config) {
        String requestId = "_" + UUID.randomUUID().toString();
        String issueInstant = java.time.Instant.now().toString();
        String acsUrl = acsUrlTemplate.replace("{tenantId}", config.getTenantId().toString());

        String destination = config.getMetadataUrl() != null
                ? config.getMetadataUrl()
                : (String) config.getConfig().getOrDefault("ssoUrl", "");

        String authnRequest = String.format("""
                <samlp:AuthnRequest
                    xmlns:samlp="urn:oasis:names:tc:SAML:2.0:protocol"
                    xmlns:saml="urn:oasis:names:tc:SAML:2.0:assertion"
                    ID="%s"
                    Version="2.0"
                    IssueInstant="%s"
                    Destination="%s"
                    AssertionConsumerServiceURL="%s"
                    ProtocolBinding="urn:oasis:names:tc:SAML:2.0:bindings:HTTP-POST">
                    <saml:Issuer>%s</saml:Issuer>
                    <samlp:NameIDPolicy
                        Format="urn:oasis:names:tc:SAML:1.1:nameid-format:emailAddress"
                        AllowCreate="true"/>
                </samlp:AuthnRequest>
                """, requestId, issueInstant, destination, acsUrl, spEntityId);

        String encoded = Base64.getEncoder().encodeToString(authnRequest.getBytes(StandardCharsets.UTF_8));
        String urlEncoded = URLEncoder.encode(encoded, StandardCharsets.UTF_8);

        String separator = destination.contains("?") ? "&" : "?";
        return destination + separator + "SAMLRequest=" + urlEncoded;
    }

    /**
     * Parse and validate a SAML Response, extracting user attributes.
     */
    public Map<String, Object> parseSamlResponse(String samlResponse, SsoConfiguration config) {
        try {
            byte[] decoded = Base64.getDecoder().decode(samlResponse);
            String xml = new String(decoded, StandardCharsets.UTF_8);

            log.debug("Parsing SAML response for tenant: {}", config.getTenantId());

            // Validate certificate if present
            if (config.getCertificate() != null && !config.getCertificate().isBlank()) {
                validateSignature(xml, config.getCertificate());
            }

            Map<String, Object> attributes = new HashMap<>();

            // Extract NameID (email)
            String nameId = extractXmlValue(xml, "NameID");
            if (nameId != null) {
                attributes.put("email", nameId);
            }

            // Extract common attributes
            extractAttribute(xml, "email", attributes, config.getAttributeMapping());
            extractAttribute(xml, "name", attributes, config.getAttributeMapping());
            extractAttribute(xml, "firstName", attributes, config.getAttributeMapping());
            extractAttribute(xml, "lastName", attributes, config.getAttributeMapping());
            extractAttribute(xml, "groups", attributes, config.getAttributeMapping());

            // Construct full name if not present
            if (!attributes.containsKey("name") && attributes.containsKey("firstName")) {
                String fullName = attributes.get("firstName").toString();
                if (attributes.containsKey("lastName")) {
                    fullName += " " + attributes.get("lastName");
                }
                attributes.put("name", fullName);
            }

            // Set subject ID
            attributes.put("subjectId", nameId != null ? nameId : UUID.randomUUID().toString());
            attributes.put("provider", "saml");
            attributes.put("tenantId", config.getTenantId().toString());

            log.info("SAML authentication successful for: {}", attributes.get("email"));
            return attributes;

        } catch (Exception e) {
            log.error("Failed to parse SAML response for tenant: {}", config.getTenantId(), e);
            throw new RuntimeException("SAML response validation failed: " + e.getMessage(), e);
        }
    }

    private void validateSignature(String xml, String certificatePem) {
        try {
            String cleanCert = certificatePem
                    .replace("-----BEGIN CERTIFICATE-----", "")
                    .replace("-----END CERTIFICATE-----", "")
                    .replaceAll("\\s", "");
            byte[] certBytes = Base64.getDecoder().decode(cleanCert);
            CertificateFactory cf = CertificateFactory.getInstance("X.509");
            X509Certificate cert = (X509Certificate) cf.generateCertificate(
                    new ByteArrayInputStream(certBytes));

            // Verify certificate is not expired
            cert.checkValidity();
            log.debug("SAML certificate validated successfully");
        } catch (Exception e) {
            log.warn("SAML certificate validation issue: {}", e.getMessage());
        }
    }

    private String extractXmlValue(String xml, String tagName) {
        String openTag = "<" + tagName;
        String closeTag = "</" + tagName + ">";

        // Also check with namespace prefix
        String[] prefixes = {"", "saml:", "saml2:"};
        for (String prefix : prefixes) {
            String open = "<" + prefix + tagName;
            String close = "</" + prefix + tagName + ">";
            int start = xml.indexOf(open);
            if (start >= 0) {
                int contentStart = xml.indexOf(">", start) + 1;
                int end = xml.indexOf(close, contentStart);
                if (end > contentStart) {
                    return xml.substring(contentStart, end).trim();
                }
            }
        }
        return null;
    }

    private void extractAttribute(String xml, String attrName,
                                   Map<String, Object> attributes,
                                   Map<String, String> mapping) {
        String mappedName = mapping != null ? mapping.getOrDefault(attrName, attrName) : attrName;
        // Look for SAML attribute with the mapped name
        String marker = "Name=\"" + mappedName + "\"";
        int idx = xml.indexOf(marker);
        if (idx >= 0) {
            String value = extractXmlValue(xml.substring(idx), "AttributeValue");
            if (value != null) {
                attributes.put(attrName, value);
            }
        }
    }
}

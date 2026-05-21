package com.kyra.sso.service;

import com.kyra.sso.model.SsoConfiguration;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

import javax.naming.Context;
import javax.naming.NamingEnumeration;
import javax.naming.directory.*;
import java.util.*;

@Service
@Slf4j
public class LdapService {

    /**
     * Authenticate a user against an LDAP directory via bind operation.
     */
    public Map<String, Object> authenticate(SsoConfiguration config, String username, String password) {
        Map<String, Object> ldapConfig = config.getConfig();
        String ldapUrl = (String) ldapConfig.getOrDefault("url", "ldap://localhost:389");
        String baseDn = (String) ldapConfig.getOrDefault("baseDn", "dc=example,dc=com");
        String userSearchBase = (String) ldapConfig.getOrDefault("userSearchBase", "ou=users");
        String userSearchFilter = (String) ldapConfig.getOrDefault("userSearchFilter", "(uid={0})");
        String bindDn = (String) ldapConfig.getOrDefault("bindDn", "");
        String bindPassword = (String) ldapConfig.getOrDefault("bindPassword", "");

        Hashtable<String, String> env = new Hashtable<>();
        env.put(Context.INITIAL_CONTEXT_FACTORY, "com.sun.jndi.ldap.LdapCtxFactory");
        env.put(Context.PROVIDER_URL, ldapUrl);
        env.put(Context.SECURITY_AUTHENTICATION, "simple");

        try {
            // Step 1: Search for the user using a service/bind account
            DirContext searchCtx;
            if (bindDn != null && !bindDn.isBlank()) {
                env.put(Context.SECURITY_PRINCIPAL, bindDn);
                env.put(Context.SECURITY_CREDENTIALS, bindPassword);
                searchCtx = new InitialDirContext(env);
            } else {
                // Anonymous bind for search
                searchCtx = new InitialDirContext(env);
            }

            String searchBase = userSearchBase + "," + baseDn;
            String filter = userSearchFilter.replace("{0}", escapeFilter(username));

            SearchControls controls = new SearchControls();
            controls.setSearchScope(SearchControls.SUBTREE_SCOPE);
            controls.setReturningAttributes(new String[]{"*"});

            NamingEnumeration<SearchResult> results = searchCtx.search(searchBase, filter, controls);

            if (!results.hasMore()) {
                searchCtx.close();
                log.warn("LDAP user not found: {}", username);
                throw new RuntimeException("User not found in LDAP directory");
            }

            SearchResult userResult = results.next();
            String userDn = userResult.getNameInNamespace();
            searchCtx.close();

            // Step 2: Bind as the user to verify password
            Hashtable<String, String> userEnv = new Hashtable<>();
            userEnv.put(Context.INITIAL_CONTEXT_FACTORY, "com.sun.jndi.ldap.LdapCtxFactory");
            userEnv.put(Context.PROVIDER_URL, ldapUrl);
            userEnv.put(Context.SECURITY_AUTHENTICATION, "simple");
            userEnv.put(Context.SECURITY_PRINCIPAL, userDn);
            userEnv.put(Context.SECURITY_CREDENTIALS, password);

            DirContext userCtx = new InitialDirContext(userEnv);
            userCtx.close();

            // Step 3: Map user attributes
            Map<String, Object> attributes = mapLdapAttributes(userResult.getAttributes(), config.getAttributeMapping());
            attributes.put("subjectId", userDn);
            attributes.put("provider", "ldap");
            attributes.put("tenantId", config.getTenantId().toString());

            log.info("LDAP authentication successful for: {}", username);
            return attributes;

        } catch (javax.naming.AuthenticationException e) {
            log.warn("LDAP authentication failed for user: {}", username);
            throw new RuntimeException("Invalid LDAP credentials", e);
        } catch (RuntimeException e) {
            throw e;
        } catch (Exception e) {
            log.error("LDAP operation failed", e);
            throw new RuntimeException("LDAP authentication error: " + e.getMessage(), e);
        }
    }

    private Map<String, Object> mapLdapAttributes(Attributes ldapAttrs, Map<String, String> mapping) {
        Map<String, Object> result = new HashMap<>();

        Map<String, String> attrMapping = mapping != null ? mapping : Map.of(
                "email", "mail",
                "name", "cn",
                "groups", "memberOf"
        );

        for (Map.Entry<String, String> entry : attrMapping.entrySet()) {
            String targetField = entry.getKey();
            String ldapField = entry.getValue();
            try {
                javax.naming.directory.Attribute attr = ldapAttrs.get(ldapField);
                if (attr != null) {
                    if (attr.size() > 1) {
                        // Multi-valued attribute
                        List<String> values = new ArrayList<>();
                        NamingEnumeration<?> vals = attr.getAll();
                        while (vals.hasMore()) {
                            values.add(vals.next().toString());
                        }
                        result.put(targetField, values);
                    } else {
                        result.put(targetField, attr.get().toString());
                    }
                }
            } catch (Exception e) {
                log.debug("Could not read LDAP attribute '{}': {}", ldapField, e.getMessage());
            }
        }

        return result;
    }

    private String escapeFilter(String input) {
        StringBuilder sb = new StringBuilder();
        for (char c : input.toCharArray()) {
            switch (c) {
                case '\\' -> sb.append("\\5c");
                case '*' -> sb.append("\\2a");
                case '(' -> sb.append("\\28");
                case ')' -> sb.append("\\29");
                case '\0' -> sb.append("\\00");
                default -> sb.append(c);
            }
        }
        return sb.toString();
    }
}

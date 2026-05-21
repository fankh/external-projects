package com.kyra.security.permissions;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.UUID;

@Repository
public interface PermissionGrantRepository extends JpaRepository<PermissionGrant, UUID> {

    /** All grants that could possibly match this subject. We fetch broadly then filter in-memory. */
    @Query("SELECT g FROM PermissionGrant g WHERE " +
           "(g.tenantId IS NULL OR g.tenantId = :tenantId) AND (" +
           "  (g.subjectType = 'USER'   AND g.subjectId = :userIdStr) OR " +
           "  (g.subjectType = 'ROLE'   AND g.subjectId = :role) OR " +
           "  (g.subjectType = 'TENANT' AND g.subjectId = :tenantIdStr) OR " +
           "   g.subjectType = 'GLOBAL'" +
           ")")
    List<PermissionGrant> findApplicable(@Param("userIdStr") String userIdStr,
                                         @Param("role") String role,
                                         @Param("tenantIdStr") String tenantIdStr,
                                         @Param("tenantId") UUID tenantId);
}

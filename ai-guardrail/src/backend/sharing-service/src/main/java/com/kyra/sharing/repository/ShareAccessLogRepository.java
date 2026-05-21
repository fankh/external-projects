package com.kyra.sharing.repository;

import com.kyra.sharing.model.ShareAccessLog;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.UUID;

@Repository
public interface ShareAccessLogRepository extends JpaRepository<ShareAccessLog, UUID> {

    List<ShareAccessLog> findBySharedContentId(UUID sharedContentId);
}

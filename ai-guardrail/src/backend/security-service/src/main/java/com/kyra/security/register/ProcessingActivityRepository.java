package com.kyra.security.register;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;
import java.util.UUID;

@Repository
public interface ProcessingActivityRepository extends JpaRepository<ProcessingActivity, UUID> {}

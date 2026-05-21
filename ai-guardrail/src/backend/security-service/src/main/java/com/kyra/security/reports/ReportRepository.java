package com.kyra.security.reports;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;
import java.util.List;
import java.util.UUID;

@Repository
interface ReportScheduleRepository extends JpaRepository<ReportSchedule, UUID> {
    List<ReportSchedule> findByEnabledTrue();
}

@Repository
interface GeneratedReportRepository extends JpaRepository<GeneratedReport, UUID> {
    List<GeneratedReport> findTop50ByOrderByGeneratedAtDesc();
}

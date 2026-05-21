package com.kyra.security.reports;

import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;

import java.util.List;
import java.util.Map;
import java.util.UUID;

@RestController
@RequestMapping("/v1/reports")
@RequiredArgsConstructor
public class ReportController {

    private final ReportScheduleRepository scheduleRepo;
    private final GeneratedReportRepository reportRepo;

    private void requireAdmin(String role) {
        if (!"admin".equalsIgnoreCase(role))
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Admin role required");
    }

    @GetMapping("/schedules")
    public ResponseEntity<List<ReportSchedule>> listSchedules(
            @RequestHeader(value = "X-User-Role", required = false) String role) {
        requireAdmin(role);
        return ResponseEntity.ok(scheduleRepo.findAll());
    }

    @PostMapping("/schedules")
    public ResponseEntity<ReportSchedule> create(
            @RequestHeader(value = "X-User-Role", required = false) String role,
            @RequestBody ReportSchedule in) {
        requireAdmin(role);
        return ResponseEntity.ok(scheduleRepo.save(in));
    }

    @DeleteMapping("/schedules/{id}")
    public ResponseEntity<Map<String, Object>> delete(
            @RequestHeader(value = "X-User-Role", required = false) String role,
            @PathVariable UUID id) {
        requireAdmin(role);
        scheduleRepo.deleteById(id);
        return ResponseEntity.ok(Map.of("deleted", id.toString()));
    }

    @GetMapping("/generated")
    public ResponseEntity<List<GeneratedReport>> listGenerated(
            @RequestHeader(value = "X-User-Role", required = false) String role) {
        requireAdmin(role);
        return ResponseEntity.ok(reportRepo.findTop50ByOrderByGeneratedAtDesc());
    }

    @PostMapping("/generate-now")
    public ResponseEntity<Map<String, Object>> generateNow(
            @RequestHeader(value = "X-User-Role", required = false) String role,
            @RequestBody Map<String, String> body) {
        requireAdmin(role);
        String type = body.getOrDefault("reportType", "compliance_status");
        // Stub: in production, the scheduler calls ComplianceStatusController internally
        // and writes to /tmp/reports/. For now, just record the request.
        GeneratedReport r = GeneratedReport.builder()
                .reportType(type)
                .format("json")
                .filePath("/tmp/reports/" + java.util.UUID.randomUUID() + ".json")
                .sizeBytes(0L)
                .expiresAt(java.time.Instant.now().plus(java.time.Duration.ofDays(30)))
                .build();
        r = reportRepo.save(r);
        return ResponseEntity.ok(Map.of("report_id", r.getId().toString(), "status", "generated"));
    }
}

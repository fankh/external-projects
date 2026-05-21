package com.kyra.common.audit;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.data.redis.connection.stream.MapRecord;
import org.springframework.data.redis.connection.stream.StreamRecords;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.stereotype.Component;

import java.util.HashMap;
import java.util.Map;

@Slf4j
@Component
@RequiredArgsConstructor
public class AuditPublisher {

    private final StringRedisTemplate redisTemplate;
    private final ObjectMapper objectMapper;

    @Value("${kyra.audit.stream-key:kyra:audit:stream}")
    private String streamKey;

    public void publish(AuditEvent event) {
        try {
            Map<String, String> fields = new HashMap<>();
            fields.put("userId", event.userId() != null ? event.userId().toString() : "");
            fields.put("action", event.action());
            fields.put("resourceType", event.resourceType() != null ? event.resourceType() : "");
            fields.put("resourceId", event.resourceId() != null ? event.resourceId() : "");
            fields.put("ipAddress", event.ipAddress() != null ? event.ipAddress() : "");
            fields.put("status", event.status() != null ? event.status() : "");
            fields.put("timestamp", event.timestamp().toString());

            if (event.details() != null && !event.details().isEmpty()) {
                fields.put("details", objectMapper.writeValueAsString(event.details()));
            }

            MapRecord<String, String, String> record = StreamRecords
                    .string(fields)
                    .withStreamKey(streamKey);

            redisTemplate.opsForStream().add(record);

            log.debug("Published audit event: action={}, resourceType={}, resourceId={}",
                    event.action(), event.resourceType(), event.resourceId());
        } catch (JsonProcessingException e) {
            log.error("Failed to serialize audit event details: {}", e.getMessage(), e);
        } catch (Exception e) {
            log.error("Failed to publish audit event to Redis stream: {}", e.getMessage(), e);
        }
    }
}

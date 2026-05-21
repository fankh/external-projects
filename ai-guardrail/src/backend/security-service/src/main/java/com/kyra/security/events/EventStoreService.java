package com.kyra.security.events;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.Map;
import java.util.UUID;

@Service @RequiredArgsConstructor @Slf4j
public class EventStoreService {

    private final EventStoreRepository repo;

    @Transactional
    public DomainEvent append(String aggregateType, String aggregateId, String eventType,
                               Map<String, Object> payload, UUID tenantId, UUID actorId) {
        long nextVersion = repo.countByAggregateTypeAndAggregateId(aggregateType, aggregateId) + 1;
        DomainEvent e = DomainEvent.builder()
            .aggregateType(aggregateType)
            .aggregateId(aggregateId)
            .eventType(eventType)
            .version((int) nextVersion)
            .payload(payload)
            .tenantId(tenantId)
            .actorId(actorId)
            .build();
        e = repo.save(e);
        log.debug("event appended: {} {} v{}", aggregateType, eventType, nextVersion);
        return e;
    }

    public List<DomainEvent> replay(String aggregateType, String aggregateId) {
        return repo.findByAggregateTypeAndAggregateIdOrderByVersionAsc(aggregateType, aggregateId);
    }

    public List<DomainEvent> recent() {
        return repo.findTop100ByOrderByCreatedAtDesc();
    }
}

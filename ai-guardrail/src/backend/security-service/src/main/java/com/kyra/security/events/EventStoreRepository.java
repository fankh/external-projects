package com.kyra.security.events;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;
import java.util.List;

@Repository
public interface EventStoreRepository extends JpaRepository<DomainEvent, Long> {
    List<DomainEvent> findByAggregateTypeAndAggregateIdOrderByVersionAsc(String aggType, String aggId);
    List<DomainEvent> findTop100ByOrderByCreatedAtDesc();
    long countByAggregateTypeAndAggregateId(String aggType, String aggId);
}

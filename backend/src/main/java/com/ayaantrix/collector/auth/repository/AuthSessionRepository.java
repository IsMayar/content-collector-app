package com.ayaantrix.collector.auth.repository;
import com.ayaantrix.collector.auth.entity.AuthSession;
import org.springframework.data.jpa.repository.*;
import org.springframework.data.repository.query.Param;
import java.time.Instant;
import java.util.*;
public interface AuthSessionRepository extends JpaRepository<AuthSession,UUID> {
    @Lock(jakarta.persistence.LockModeType.PESSIMISTIC_WRITE)
    @Query("select s from AuthSession s where s.id=:id") Optional<AuthSession> findLockedById(@Param("id") UUID id);
    List<AuthSession> findByUserIdOrderByCreatedAtDesc(UUID userId,org.springframework.data.domain.Pageable pageable);
    @Modifying(flushAutomatically=true)
    @Query("update AuthSession s set s.revokedAt=:now,s.updatedAt=:now where s.userId=:userId and s.revokedAt is null")
    int revokeAll(@Param("userId") UUID userId,@Param("now") Instant now);
}
